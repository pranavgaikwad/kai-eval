import { promises as fsPromises } from "fs";
import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { Logger } from "winston";

import { Task, TaskProvider, BaseInitParams } from "./types";
import { EventDebouncer } from "../eventDebouncer";
import { FileWatchCapable, FileChangeEvent } from "../fsWatch";

export interface AnalyzerInitParams extends BaseInitParams {
  analyzerBinaryPath: string;
  targets: string[];
  sources: string[];
  rulesPaths: string[];
  pipePath: string;
  analysisLogPath: string;
  excludedPaths: string[];
}

// TODO (pgaikwad): remove this once we have a proper analyze params type
interface _AnalyzeParams {
  includedPaths: string[];
  excludedPaths: string[];
  labelSelector: string;
  resetCache: boolean;
}

export class AnalysisTasksProvider
  implements FileWatchCapable, TaskProvider<AnalyzerInitParams, void>
{
  private analyzerRPCServer: ChildProcessWithoutNullStreams | null = null;
  private readonly debouncer: EventDebouncer<FileChangeEvent>;

  constructor(private readonly logger: Logger) {
    this.debouncer = new EventDebouncer(logger, {
      debounceMs: 3000,
      processor: this.runAnalysis.bind(this),
      filter: this.filterRelevantFiles.bind(this),
      deduplicate: this.deduplicateByPath.bind(this),
    },
  );
  }

  async init(params: AnalyzerInitParams): Promise<void> {
    await this.validateInitParams(params);
    this.spawnAnalyzerProcess(params);
  }

  async getCurrentTasks(): Promise<Task[]> {
    await this.debouncer.waitUntilIdle();
    return Promise.resolve([]);
  }

  async stop(): Promise<void> {}

  private async validateInitParams(params: AnalyzerInitParams): Promise<void> {
    if (!params.analyzerBinaryPath) {
      throw new Error("analyzerBinaryPath is required");
    }
    try {
      const stat = await fsPromises.stat(params.analyzerBinaryPath);
      if (!stat.isFile()) {
        throw new Error("analyzerBinaryPath is not a file");
      }
    } catch (error) {
      throw new Error(`Failed to validate analyzerBinaryPath: ${error}`);
    }
    if (!params.workspacePaths) {
      throw new Error("workspacePaths is required");
    }
    for (const workspacePath of params.workspacePaths) {
      try {
        const stat = await fsPromises.stat(workspacePath);
        if (!stat.isDirectory()) {
          throw new Error(`workspacePath is not a directory: ${workspacePath}`);
        }
      } catch (error) {
        throw new Error(
          `Failed to validate workspacePath: ${workspacePath}: ${error}`,
        );
      }
    }
    if (!params.targets) {
      throw new Error("targets is required");
    }
    if (!params.sources) {
      throw new Error("sources is required");
    }
    if (!params.rulesPaths) {
      throw new Error("rulesPaths is required");
    }
    for (const rulesPath of params.rulesPaths) {
      try {
        await fsPromises.access(rulesPath, fsPromises.constants.F_OK);
      } catch (error) {
        throw new Error(`Failed to validate rulesPath: ${rulesPath}: ${error}`);
      }
    }
    if (!params.pipePath) {
      throw new Error("pipePath is required");
    }
    try {
      const stat = await fsPromises.stat(params.pipePath);
      if (!stat.isFile()) {
        throw new Error("pipePath is not a file");
      }
    } catch (error) {
      throw new Error(
        `Failed to validate pipePath: ${params.pipePath}: ${error}`,
      );
    }
  }

  private spawnAnalyzerProcess(params: AnalyzerInitParams) {
    const analyzerRpcServer = spawn(
      params.analyzerBinaryPath,
      [
        "-pipePath",
        params.pipePath,
        "-rules",
        params.rulesPaths.join(","),
        "-source-directory",
        params.workspacePaths[0],
        "-log-file",
        params.analysisLogPath,
      ],
      {
        cwd: params.workspacePaths[0],
        env: process.env,
      },
    );

    analyzerRpcServer.stderr.on("data", (_data) => {
      // TODO (pgaikwad): handle this
    });

    analyzerRpcServer.on("exit", (_code, _signal) => {
      this.analyzerRPCServer = null;
      // TODO (pgaikwad): handle exit codes and signals here
    });
    analyzerRpcServer.on("close", (_code, _signal) => {
      this.analyzerRPCServer = null;
      // TODO (pgaikwad): handle close codes and signals here
    });
    analyzerRpcServer.on("error", (_err) => {
      // TODO (pgaikwad): handle errors here
      this.analyzerRPCServer = null;
    });
    this.analyzerRPCServer = analyzerRpcServer;
  }

  isInitialized(): boolean {
    return this.analyzerRPCServer !== null;
  }

  async onFileChange(event: FileChangeEvent): Promise<void> {
    this.debouncer.addEvent(event);
  }

  private async runAnalysis(events: FileChangeEvent[]): Promise<void> {
    this.logger.info("AnalysisProvider running analysis for file changes", {
      changeCount: events.length
    });
    events.forEach((event) => {
      this.logger.info("File change event", {
        type: event.type,
        path: event.path,
        timestamp: event.timestamp.toISOString()
      });
    });

    this.logger.info("AnalysisProvider analysis completed", {
      changeCount: events.length
    });
  }

  private filterRelevantFiles(events: FileChangeEvent[]): FileChangeEvent[] {
    const relevantExtensions = [
      ".java",
      ".xml",
      ".properties",
      ".gradle",
      ".pom",
      ".json",
      ".yaml",
    ];

    return events.filter((event) => {
      const hasRelevantExtension = relevantExtensions.some((ext) =>
        event.path.toLowerCase().endsWith(ext),
      );

      // Also include if it's a build file
      const isBuildFile = event.path.match(
        /\/(pom\.xml|build\.gradle|gradle\.properties)$/,
      );

      return hasRelevantExtension || isBuildFile;
    });
  }

  private deduplicateByPath(events: FileChangeEvent[]): FileChangeEvent[] {
    const eventMap = new Map<string, FileChangeEvent>();
    events.forEach((event) => {
      const existing = eventMap.get(event.path);
      if (!existing || event.timestamp > existing.timestamp) {
        eventMap.set(event.path, event);
      }
    });
    return Array.from(eventMap.values());
  }
}
