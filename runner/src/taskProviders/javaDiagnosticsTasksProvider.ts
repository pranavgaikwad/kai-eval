import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

import { Logger } from "winston";

import {
  TasksStoreManager,
  ProcessManager,
  RPCConnectionManager,
} from "./managers";
import { DiagnosticTask, DiagnosticTaskFactory } from "./tasks";
import {
  TaskProvider,
  Task,
  BaseInitParams,
  Diagnostic,
  InitializeParams,
} from "./types";
import { EventDebouncer } from "../utils/eventDebouncer";
import { FileWatchCapable, FileChangeEvent } from "../utils/fsWatch";
import { pathToUri } from "../utils/paths";

export interface JavaDiagnosticsInitParams extends BaseInitParams {
  jdtlsBinaryPath: string;
  jdtlsBundles: string[];
  jvmMaxMem?: string;
  logDir?: string;
}

export interface JavaDiagnosticsInitResult {
  pipeName: string;
}

export class JavaDiagnosticsTasksProvider
  implements
    FileWatchCapable,
    TaskProvider<JavaDiagnosticsInitParams, JavaDiagnosticsInitResult>
{
  private readonly connectionManager: RPCConnectionManager;
  private readonly diagnosticsManager: TasksStoreManager<
    Diagnostic,
    DiagnosticTask
  >;
  private readonly processManager: ProcessManager;
  private readonly debouncer: EventDebouncer<FileChangeEvent>;
  private initialized = false;
  private pipeName?: string;
  private diagnosticsUpdatePromise?: {
    resolve: () => void;
    timeout: NodeJS.Timeout;
  };

  constructor(private readonly logger: Logger) {
    this.connectionManager = new RPCConnectionManager(
      logger.child({ module: "JavaLSPConnectionManager" }),
    );
    this.diagnosticsManager = new TasksStoreManager(
      logger.child({ module: "JavaDiagnosticsStore" }),
      new DiagnosticTaskFactory(),
    );
    this.processManager = new ProcessManager(
      logger.child({ module: "JdtlsProcessManager" }),
    );
    this.logger = logger.child({ module: "JavaDiagnosticsTasksProvider" });

    this.debouncer = new EventDebouncer(this.logger, {
      debounceMs: 1000,
      processor: this.getLatestDiagnostics.bind(this),
      filter: this.filterJavaFiles.bind(this),
      deduplicate: this.deduplicateByPath.bind(this),
    });
  }

  async init(
    params: JavaDiagnosticsInitParams,
  ): Promise<JavaDiagnosticsInitResult> {
    await this.validateInitParams(params);
    const javaExecutable = await this.getJavaExecutable();
    const jdtlsArgs = await this.buildJdtlsArgs(params);
    const logDir = params.logDir || path.join(os.tmpdir(), "jdtls-logs");
    this.logger.info("Spawning JDTLS process", { logDir });
    try {
      await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create log directory: ${logDir} - ${error}`);
    }
    const { pipeName } = await this.processManager.spawn(
      javaExecutable,
      jdtlsArgs,
      {
        cwd: logDir,
        onExit: () => {
          this.initialized = false;
        },
        onStderr: async (data) => {
          try {
            await fs.appendFile(path.join(logDir, "jdtls.log"), data);
          } catch (error) {
            this.logger.error("Failed to append JDTLS stderr to log file", {
              error,
            });
          }
        },
        onStdout: async (data) => {
          try {
            await fs.appendFile(path.join(logDir, "jdtls.log"), data);
          } catch (error) {
            this.logger.error("Failed to append JDTLS stdout to log file", {
              error,
            });
          }
        },
        listenOnPipe: true,
      },
    );
    if (!pipeName) {
      throw new Error("Failed to spawn process and create pipe");
    }
    await this.connectionManager.connectToPipe(pipeName);
    this.connectionManager.onDiagnostics((params) => {
      this.diagnosticsManager.updateData(params.uri, params.diagnostics);

      // Resolve any pending diagnostics update promise
      if (this.diagnosticsUpdatePromise) {
        clearTimeout(this.diagnosticsUpdatePromise.timeout);
        this.diagnosticsUpdatePromise.resolve();
        this.diagnosticsUpdatePromise = undefined;
      }
    });
    const initParams = await this.buildJavaInitializeParams(params);
    this.logger.debug("Sending initialize request to LSP server");
    await this.connectionManager.sendInitialize(initParams);
    this.logger.debug("Initialize request sent to LSP server");
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
    this.initialized = false;
  }

  async onFileChange(event: FileChangeEvent): Promise<void> {
    this.debouncer.addEvent(event);
  }

  private async validateInitParams(
    params: JavaDiagnosticsInitParams,
  ): Promise<void> {
    if (!params.jdtlsBinaryPath) {
      throw new Error("jdtBinaryPath is required");
    }
    if (!params.workspacePaths || params.workspacePaths.length === 0) {
      throw new Error("workspacePaths is required and must not be empty");
    }

    try {
      await fs.access(params.jdtlsBinaryPath);
    } catch (error) {
      throw new Error(
        `JDTLS binary not found at path: ${params.jdtlsBinaryPath} - ${error}`,
      );
    }

    for (const workspacePath of params.workspacePaths) {
      try {
        const stat = await fs.stat(workspacePath);
        if (!stat.isDirectory()) {
          throw new Error(
            `Workspace path is not a directory: ${workspacePath}`,
          );
        }
      } catch (error) {
        throw new Error(
          `Workspace path does not exist: ${workspacePath} - ${error}`,
        );
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
        "java" + (os.platform() === "win32" ? ".exe" : ""),
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
    params: JavaDiagnosticsInitParams,
  ): Promise<string[]> {
    const jdtlsBaseDir = path.dirname(path.dirname(params.jdtlsBinaryPath));
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
    params: JavaDiagnosticsInitParams,
  ): Promise<InitializeParams> {
    const absoluteWorkspacePaths = await Promise.all(
      params.workspacePaths.map(async (workspacePath) => {
        return path.resolve(workspacePath);
      }),
    );

    const primaryWorkspacePath = path.resolve(absoluteWorkspacePaths[0]);
    const workspaceFolders = absoluteWorkspacePaths.map((path) =>
      pathToUri(path),
    );

    let absoluteBundles: string[] = [];
    if (params.jdtlsBundles) {
      absoluteBundles = await Promise.all(
        params.jdtlsBundles.map(async (bundle) => {
          return path.resolve(bundle);
        }),
      );
    }

    return {
      rootUri: pathToUri(primaryWorkspacePath),
      capabilities: {
        workspace: {
          workspaceFolders: true,
          didChangeWatchedFiles: {
            dynamicRegistration: true,
          },
        },
        textDocument: {
          publishDiagnostics: {
            relatedInformation: true,
            versionSupport: false,
            tagSupport: {
              valueSet: [1, 2],
            },
          },
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
    this.logger.debug("Processing file changes", {
      changeCount: events.length,
    });
    try {
      await this.notifyFileChanges(events);
      // wait for diagnostics to be updated
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.diagnosticsUpdatePromise === undefined) {
            resolve();
          } else {
            this.diagnosticsUpdatePromise = undefined;
            resolve();
          }
        }, 5000);
        this.diagnosticsUpdatePromise = { resolve, timeout };
      });
      this.logger.debug(
        "File changes processed and Java diagnostics refreshed",
      );
    } catch (error) {
      this.logger.warn("Failed to refresh Java diagnostics", { error });
    }
  }

  private async notifyFileChanges(events: FileChangeEvent[]): Promise<void> {
    for (const event of events) {
      try {
        switch (event.type) {
          case "created":
            await this.connectionManager.openTextDocument(
              event.path,
              await fs.readFile(event.path, "utf-8"),
            );
            break;
          case "modified": {
            const fileContent = await fs.readFile(event.path, "utf-8");
            await this.connectionManager.openTextDocument(
              event.path,
              fileContent,
            );
            await this.connectionManager.changeTextDocument(
              event.path,
              fileContent,
            );
            break;
          }
          case "deleted":
            await this.connectionManager.closeTextDocument(event.path);
            break;
          default:
            this.logger.warn("Unknown file change event type", {
              type: event.type,
              path: event.path,
            });
        }
      } catch (error) {
        this.logger.warn("Failed to notify file change", {
          path: event.path,
          type: event.type,
          error,
        });
      }
    }
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
}
