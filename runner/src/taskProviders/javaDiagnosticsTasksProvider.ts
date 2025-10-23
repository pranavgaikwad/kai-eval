import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { Logger } from "winston";

import { TaskProvider, Task, BaseInitParams } from "./types";
import { EventDebouncer } from "../eventDebouncer";
import { FileWatchCapable, FileChangeEvent } from "../fsWatch";
import { DiagnosticsManager } from "./managers/diagnosticsManager";
import {
  InitializeParams,
  pathToUri,
} from "./managers/lsp";
import { LSPConnectionManager } from "./managers/lspConnectionManager";
import { ProcessManager } from "./managers/processManager";

export interface JavaDiagnosticsInitParams extends BaseInitParams {
  jdtBinaryPath: string;
  bundles: string[];
  jvmMaxMem?: string;
}

export interface JavaDiagnosticsInitResult {
  pipeName: string;
}

export class JavaDiagnosticsTasksProvider
  implements FileWatchCapable, TaskProvider<JavaDiagnosticsInitParams, JavaDiagnosticsInitResult>
{
  private readonly connectionManager: LSPConnectionManager;
  private readonly diagnosticsManager: DiagnosticsManager;
  private readonly processManager: ProcessManager;
  private readonly debouncer: EventDebouncer<FileChangeEvent>;
  private initialized = false;
  private tempDir?: string;
  private pipeName?: string;

  constructor(private readonly logger: Logger) {
    this.connectionManager = new LSPConnectionManager(logger);
    this.diagnosticsManager = new DiagnosticsManager(logger);
    this.processManager = new ProcessManager(logger);

    this.debouncer = new EventDebouncer(logger, {
        debounceMs: 1000,
        processor: this.getLatestDiagnostics.bind(this),
        filter: this.filterJavaFiles.bind(this),
        deduplicate: this.deduplicateByPath.bind(this),
      },
    );
  }

  async init(params: JavaDiagnosticsInitParams): Promise<JavaDiagnosticsInitResult> {
    await this.validateInitParams(params);
    this.tempDir = await this.createTempDirectory();
    const javaExecutable = await this.getJavaExecutable();
    const jdtlsArgs = await this.buildJdtlsArgs(params);
    const { pipeName } = await this.processManager.spawn(javaExecutable, jdtlsArgs, {
      cwd: this.tempDir,
      onExit: () => {
        this.initialized = false;
      },
      usePipeBridge: true,
    });
    if (!pipeName) {
      throw new Error("Failed to spawn process and create pipe");
    }
    await this.connectionManager.connectToPipe(pipeName);
    this.connectionManager.onDiagnostics((params) => {
      this.diagnosticsManager.updateDiagnostics(params);
    });
    const initParams = await this.buildJavaInitializeParams(params);
    this.logger.info("Sending initialize request to LSP server");
    await this.connectionManager.sendInitialize(initParams);
    this.logger.info("Initialize request sent to LSP server");
    this.initialized = true;
    return { pipeName };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async getCurrentTasks(): Promise<Task[]> {
    await this.debouncer.waitUntilIdle();
    return this.diagnosticsManager.getAllTasks();
  }

  async stop(): Promise<void> {
    await this.connectionManager.disconnect();
    await this.processManager.terminate();

    if (this.pipeName) {
      await this.processManager.cleanupFile(this.pipeName);
      this.pipeName = undefined;
    }

    if (this.tempDir) {
      await this.cleanupTempDirectory();
      this.tempDir = undefined;
    }

    this.initialized = false;
  }

  async onFileChange(event: FileChangeEvent): Promise<void> {
    this.debouncer.addEvent(event);
  }

  private async validateInitParams(params: JavaDiagnosticsInitParams): Promise<void> {
    if (!params.jdtBinaryPath) {
      throw new Error("jdtBinaryPath is required");
    }
    if (!params.workspacePaths || params.workspacePaths.length === 0) {
      throw new Error("workspacePaths is required and must not be empty");
    }

    try {
      await fs.access(params.jdtBinaryPath);
    } catch (error) {
      throw new Error(
        `JDTLS binary not found at path: ${params.jdtBinaryPath} - ${error}`
      );
    }

    for (const workspacePath of params.workspacePaths) {
      try {
        const stat = await fs.stat(workspacePath);
        if (!stat.isDirectory()) {
          throw new Error(
            `Workspace path is not a directory: ${workspacePath}`
          );
        }
      } catch (error) {
        throw new Error(`Workspace path does not exist: ${workspacePath} - ${error}`);
      }
    }
  }

  private async getJavaExecutable(): Promise<string> {
    let javaExecutable = "java";
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
      const javaExecToTest = path.join(
        javaHome,
        "bin",
        "java" + (os.platform() === "win32" ? ".exe" : "")
      );
      try {
        await fs.access(javaExecToTest);
        javaExecutable = javaExecToTest;
      } catch (_error) {
        // TODO (pgaikwad): handle error here
      }
    }
    return javaExecutable;
  }

  private async getSharedConfigPath(jdtlsBaseDir: string): Promise<string> {
    let configDir: string;

    switch (os.platform()) {
      case "linux":
      case "freebsd":
        configDir = "config_linux";
        break;
      case "darwin":
        configDir = "config_mac";
        break;
      case "win32":
        configDir = "config_win";
        break;
      default:
        throw new Error(`Unknown platform ${os.platform()} detected`);
    }

    return path.join(jdtlsBaseDir, configDir);
  }

  private async findEquinoxLauncher(jdtlsBaseDir: string): Promise<string> {
    const pluginsDir = path.join(jdtlsBaseDir, "plugins");
    try {
      const files = await fs.readdir(pluginsDir);
      for (const file of files) {
        if (
          file.startsWith("org.eclipse.equinox.launcher_") &&
          file.endsWith(".jar")
        ) {
          return path.join(pluginsDir, file);
        }
      }
      throw new Error("Cannot find equinox launcher");
    } catch (error) {
      throw new Error(`Failed to read plugins directory: ${error}`);
    }
  }

  private async buildJdtlsArgs(
    params: JavaDiagnosticsInitParams
  ): Promise<string[]> {
    const jdtlsBaseDir = path.dirname(path.dirname(params.jdtBinaryPath));
    const sharedConfigPath = await this.getSharedConfigPath(jdtlsBaseDir);
    const jarPath = await this.findEquinoxLauncher(jdtlsBaseDir);

    const args = [
      "-Declipse.application=org.eclipse.jdt.ls.core.id1",
      "-Dosgi.bundles.defaultStartLevel=4",
      "-Declipse.product=org.eclipse.jdt.ls.core.product",
      "-Dosgi.checkConfiguration=true",
      `-Dosgi.sharedConfiguration.area=${sharedConfigPath}`,
      "-Dosgi.sharedConfiguration.area.readOnly=true",
      "-Dosgi.configuration.cascaded=true",
      "-Xms1g",
      "-XX:MaxRAMPercentage=70.0",
      "--add-modules=ALL-SYSTEM",
      "--add-opens",
      "java.base/java.util=ALL-UNNAMED",
      "--add-opens",
      "java.base/java.lang=ALL-UNNAMED",
      "-jar",
      jarPath,
      "-Djava.net.useSystemProxies=true",
      "-configuration",
      "./",
      "-data",
      ".",
    ];

    if (params.jvmMaxMem) {
      args.push(`-Xmx${params.jvmMaxMem}`);
    }

    return args;
  }

  private async buildJavaInitializeParams(
    params: JavaDiagnosticsInitParams
  ): Promise<InitializeParams> {
    const absoluteWorkspacePaths = await Promise.all(
      params.workspacePaths.map(async (workspacePath) => {
        return path.resolve(workspacePath);
      })
    );

    const primaryWorkspacePath = absoluteWorkspacePaths[0];
    const primaryWorkspaceUri = pathToUri(primaryWorkspacePath);
    const workspaceFolders: string[] = absoluteWorkspacePaths.map((wsPath) =>
      pathToUri(wsPath)
    );

    let absoluteBundles: string[] = [];
    if (params.bundles) {
      absoluteBundles = await Promise.all(
        params.bundles.map(async (bundle) => {
          return path.resolve(bundle);
        })
      );
    }

    return {
      rootUri: primaryWorkspaceUri,
      capabilities: {
        workspace: {
          workspaceFolders: true,
        },
      },
      extendedClientCapabilities: {
        classFileContentsSupport: true,
      },
      initializationOptions: {
        bundles: absoluteBundles,
        workspaceFolders: workspaceFolders,
        settings: {
          java: {
            autobuild: {
              enabled: true,
            },
            maven: {
              downloadSources: true,
            },
            configuration: {
              updateBuildConfiguration: "automatic",
            },
          },
        },
      },
    };
  }

  private async getLatestDiagnostics(events: FileChangeEvent[]): Promise<void> {
    this.logger.info("JavaDiagnosticsProvider processing file changes", {
      changeCount: events.length
    });

    events.forEach((event) => {
      this.logger.debug("File change event", {
        type: event.type,
        path: event.path,
        timestamp: event.timestamp.toISOString()
      });
    });

    this.logger.info("JavaDiagnosticsProvider file changes processed, awaiting diagnostic updates");
  }

  private filterJavaFiles(events: FileChangeEvent[]): FileChangeEvent[] {
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

  private async createTempDirectory(): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "jdtls-"));
    this.logger.info("Created temporary directory for JDTLS", { tempDir });
    return tempDir;
  }

  private async cleanupTempDirectory(): Promise<void> {
    if (!this.tempDir) return;

    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
      this.logger.info("Cleaned up temporary directory", { tempDir: this.tempDir });
    } catch (error) {
      this.logger.warn("Failed to cleanup temporary directory", { tempDir: this.tempDir, error });
    }
  }
}