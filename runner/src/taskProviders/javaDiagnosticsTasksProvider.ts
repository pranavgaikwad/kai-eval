import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

import type { Logger } from "winston";

import {
  TasksStoreManager,
  ProcessManager,
  RPCConnectionManager,
} from "./managers";
import { type DiagnosticTask, DiagnosticTaskFactory } from "./tasks";
import type {
  TaskProvider,
  BaseInitParams,
  Diagnostic,
  InitializeParams,
  VersionedTasks,
} from "./types";
import { EventDebouncer } from "../utils/eventDebouncer";
import type { FileWatchCapable, FileChangeEvent } from "../utils/fsWatch";
import { pathToUri } from "../utils/paths";
import { type FileEvent, FileChangeType } from "./types/lsp";

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
  readonly name = "java-diagnostics";
  private readonly jdtlsConnectionManager: RPCConnectionManager;
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
    expectedUris: Set<string>;
    receivedUris: Set<string>;
  };

  constructor(private readonly logger: Logger) {
    this.jdtlsConnectionManager = new RPCConnectionManager(
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
    const jdtlsCwd = path.join(logDir, "jdtls-wd");
    this.logger.info("Spawning JDTLS process", { logDir });
    try {
      await fs.mkdir(jdtlsCwd, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create log directory: ${logDir} - ${error}`);
    }
    const { pipeName } = await this.processManager.spawn(
      javaExecutable,
      jdtlsArgs,
      {
        cwd: jdtlsCwd,
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
    await this.jdtlsConnectionManager.connectToPipe(pipeName);
    this.jdtlsConnectionManager.onDiagnostics((params) => {
      this.diagnosticsManager.updateData(params.uri, params.diagnostics);
      this.logger.debug("Received java diagnostics update", {
        uri: params.uri,
        diagnosticsCount: params.diagnostics.length,
      });

      // Handle pending diagnostics update promise
      if (this.diagnosticsUpdatePromise) {
        // Only track URIs we're explicitly waiting for
        if (this.diagnosticsUpdatePromise.expectedUris.has(params.uri)) {
          this.diagnosticsUpdatePromise.receivedUris.add(params.uri);

          this.logger.silly("Received diagnostics update", {
            uri: params.uri,
            receivedCount: this.diagnosticsUpdatePromise.receivedUris.size,
            expectedCount: this.diagnosticsUpdatePromise.expectedUris.size,
            expectedUris: Array.from(
              this.diagnosticsUpdatePromise.expectedUris,
            ),
            receivedUris: Array.from(
              this.diagnosticsUpdatePromise.receivedUris,
            ),
          });

          // Check if we've received all expected updates
          if (
            this.diagnosticsUpdatePromise.receivedUris.size >=
            this.diagnosticsUpdatePromise.expectedUris.size
          ) {
            clearTimeout(this.diagnosticsUpdatePromise.timeout);
            this.diagnosticsUpdatePromise.resolve();
            this.diagnosticsUpdatePromise = undefined;
          }
        }
      }
    });
    const initParams = await this.buildJavaInitializeParams(params);
    this.logger.debug("Sending initialize request to LSP server");
    await this.jdtlsConnectionManager.sendInitialize(initParams);
    this.logger.debug("Initialize request sent to LSP server");
    // wait for initial diagnostics to come in
    await this.waitForDiagnosticsPromise();
    this.initialized = true;
    return { pipeName };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async getCurrentTasks(): Promise<VersionedTasks> {
    await this.debouncer.waitUntilIdle();
    return this.diagnosticsManager.getAllTasks();
  }

  async stop(): Promise<void> {
    await this.debouncer.waitUntilIdle(10000);
    await this.debouncer.flush();
    await this.jdtlsConnectionManager.disconnect();
    await this.processManager.terminate();

    if (this.pipeName) {
      await this.processManager.cleanupFile(this.pipeName);
      this.pipeName = undefined;
    }
    this.initialized = false;
  }

  async reset(): Promise<void> {}

  async onFileChange(event: FileChangeEvent): Promise<void> {
    this.debouncer.addEvent(event);
  }

  /**
   * Wait for diagnostics updates for specific URIs to be received.
   *
   * @param expectedUris Array of URIs to wait for diagnostics updates
   * @param timeoutMs Timeout in milliseconds (default: 5000)
   * @returns Promise that resolves when expected updates are received or timeout occurs
   */
  async waitForDiagnosticsUpdates(
    expectedUris: string[],
    timeoutMs: number = 5000,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const expectedUrisSet = new Set(expectedUris);
      const timeout = setTimeout(() => {
        this.logger.debug("Diagnostics update timeout reached", {
          receivedCount: this.diagnosticsUpdatePromise?.receivedUris.size || 0,
          expectedCount: expectedUrisSet.size,
          expectedUris,
          receivedUris: Array.from(
            this.diagnosticsUpdatePromise?.receivedUris || [],
          ),
        });

        if (this.diagnosticsUpdatePromise !== undefined) {
          this.diagnosticsUpdatePromise = undefined;
        }
        resolve();
      }, timeoutMs);

      this.diagnosticsUpdatePromise = {
        resolve,
        timeout,
        expectedUris: expectedUrisSet,
        receivedUris: new Set<string>(),
      };

      this.logger.debug("Waiting for diagnostics updates", {
        expectedUris,
        expectedCount: expectedUrisSet.size,
        timeoutMs,
      });
    });
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
      // Wait for diagnostics to be updated for each file that was changed
      const expectedUris = events.map((event) => pathToUri(event.path));
      await this.waitForDiagnosticsPromise(expectedUris);
      this.logger.debug(
        "File changes processed and Java diagnostics refreshed",
      );
    } catch (error) {
      this.logger.warn("Failed to refresh Java diagnostics", { error });
    }
  }

  private async notifyFileChanges(events: FileChangeEvent[]): Promise<void> {
    try {
      const fileEvents: FileEvent[] = events.map((event) => {
        let changeType: FileChangeType;
        switch (event.type) {
          case "created":
            changeType = FileChangeType.Created;
            break;
          case "modified":
            changeType = FileChangeType.Changed;
            break;
          case "deleted":
            changeType = FileChangeType.Deleted;
            break;
          default:
            this.logger.warn("Unknown file change event type", {
              type: event.type,
              path: event.path,
            });
            changeType = FileChangeType.Changed; // Default fallback
        }

        return {
          uri: pathToUri(event.path),
          type: changeType,
        };
      });

      await this.jdtlsConnectionManager.notifyFileChanges(fileEvents);
      this.logger.debug("Notified file changes to LSP server", {
        changeCount: fileEvents.length,
      });
    } catch (error) {
      this.logger.warn("Failed to notify file changes", { error });
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

  private waitForDiagnosticsPromise(
    expectedUris: string[] = [],
  ): Promise<void> {
    // Wait for expected URIs diagnostics updates or timeout after 5 seconds
    return new Promise<void>((resolve) => {
      const expectedUrisSet = new Set(expectedUris);
      const timeout = setTimeout(() => {
        this.logger.debug("Diagnostics update timeout reached", {
          receivedCount: this.diagnosticsUpdatePromise?.receivedUris.size || 0,
          expectedCount: expectedUrisSet.size,
          expectedUris,
          receivedUris: Array.from(
            this.diagnosticsUpdatePromise?.receivedUris || [],
          ),
        });

        if (this.diagnosticsUpdatePromise !== undefined) {
          this.diagnosticsUpdatePromise = undefined;
        }
        resolve();
      }, 5000);

      this.diagnosticsUpdatePromise = {
        resolve,
        timeout,
        expectedUris: expectedUrisSet,
        receivedUris: new Set<string>(),
      };

      this.logger.debug("Waiting for diagnostics updates", {
        expectedUris,
        expectedCount: expectedUrisSet.size,
      });
    });
  }
}
