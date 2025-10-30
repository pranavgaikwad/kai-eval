import { type ChildProcess, type SpawnOptions, spawn } from "child_process";
import { promises as fs } from "fs";
import * as net from "net";
import * as os from "os";
import path from "path";

import type { Logger } from "winston";

export interface ProcessSpawnOptions extends SpawnOptions {
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onError?: (error: Error) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  pipeName?: string;
  listenOnPipe?: boolean;
}

export interface ProcessSpawnResult {
  process: ChildProcess;
  pipeName?: string;
}

export class ProcessManager {
  private process?: ChildProcess;
  private server?: net.Server;

  constructor(private readonly logger: Logger) {
    this.logger = logger.child({ module: "ProcessManager" });
  }

  async spawn(
    command: string,
    args: string[],
    options?: ProcessSpawnOptions,
  ): Promise<ProcessSpawnResult> {
    const { onStdout, onStderr, onError, onExit, ...spawnOptions } =
      options || {};

    this.process = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      ...spawnOptions,
    });

    this.setupEventHandlers(onStdout, onStderr, onError, onExit);
    const pipeName = options?.pipeName || ProcessManager.generatePipeName();
    if (options?.listenOnPipe) {
      await this.createPipeBridge(pipeName);
    }
    return { process: this.process, pipeName };
  }

  async waitForFile(filePath: string, timeoutMs = 30000): Promise<void> {
    const pollInterval = 100;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        await fs.access(filePath);
        return;
      } catch (_error) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`Timed out waiting for file creation: ${filePath}`);
  }

  async terminate(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }

    if (this.process) {
      this.process.kill("SIGTERM");

      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!this.process.killed) {
        this.process.kill("SIGKILL");
      }

      this.process = undefined;
    }
  }

  isRunning(): boolean {
    return this.process !== undefined && !this.process.killed;
  }

  getProcess(): ChildProcess | undefined {
    return this.process;
  }

  async createPipeBridge(pipeName: string): Promise<void> {
    if (!this.process) {
      throw new Error("No process to bridge to");
    }

    if (!this.process.stdin || !this.process.stdout) {
      throw new Error("Process must have stdin and stdout pipes");
    }

    this.server = net.createServer((socket) => {
      this.logger.debug("Client connected to named pipe");

      socket.pipe(this.process!.stdin!);
      this.process!.stdout!.pipe(socket);

      socket.on("error", (error) => {
        this.logger.error("Socket error", { error });
      });

      socket.on("close", () => {
        this.logger.debug("Client disconnected from named pipe");
      });
    });

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(pipeName, () => {
        this.logger.debug("Named pipe server listening", { pipeName });
        resolve();
      });

      this.server!.on("error", (error) => {
        this.logger.error("Named pipe server error", { error });
        reject(error);
      });
    });
  }

  async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      this.logger.warn("Failed to cleanup file", { filePath, error });
    }
  }

  private setupEventHandlers(
    onStdout?: (data: string) => void,
    onStderr?: (data: string) => void,
    onError?: (error: Error) => void,
    onExit?: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): void {
    if (!this.process) return;

    this.process.on("error", (error) => {
      this.logger.error("Process error", { error });
      if (onError) {
        onError(error);
      }
    });

    this.process.on("exit", (code, signal) => {
      this.logger.debug("Process exited", { code, signal });
      if (onExit) {
        onExit(code, signal);
      }
    });

    if (this.process.stdout) {
      this.process.stdout.on("data", (data) => {
        const output = data.toString();
        if (onStdout) {
          onStdout(output);
        } else {
          this.logger.debug("Process stdout", { output });
        }
      });
    }

    if (this.process.stderr) {
      this.process.stderr.on("data", (data) => {
        const output = data.toString();
        if (onStderr) {
          onStderr(output);
        } else {
          this.logger.error("Process stderr", { output });
        }
      });
    }
  }

  static generatePipeName(): string {
    const tmpDir = os.tmpdir();
    const pipeName = path.join(
      tmpDir,
      `jdtls_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    );
    return pipeName;
  }
}
