import { promises as fsPromises } from "fs";
import os from "os";
import path from "path";

import { NotificationType, RequestType } from "vscode-jsonrpc/node";
import type { Logger } from "winston";

import {
  TasksStoreManager,
  ProcessManager,
  RPCConnectionManager,
} from "./managers";
import { type AnalysisTask, AnalysisTaskFactory } from "./tasks";
import type {
  AnalysisIncident,
  AnalysisRuleSet,
  TriggerAnalysisEvent,
  TaskProvider,
  BaseInitParams,
  VersionedTasks,
} from "./types";
import { EventDebouncer } from "../utils/eventDebouncer";
import type { FileWatchCapable, FileChangeEvent } from "../utils/fsWatch";

export interface AnalyzerInitParams extends BaseInitParams {
  analyzerBinaryPath: string;
  targets: string[];
  sources: string[];
  rulesPaths: string[];
  pipePath: string;
  excludedPaths: string[];
  logDir: string;
}

// Analyzer RPC types
interface StartParams {
  type: string;
}

interface FileChange {
  path: string;
  content: string;
  saved: boolean;
}

interface NotifyFileChangesParams {
  changes: FileChange[];
}

interface AnalyzeParams {
  label_selector: string;
  included_paths?: string[];
  excluded_paths: string[];
  reset_cache: boolean;
}

interface AnalyzeResult {
  Rulesets: AnalysisRuleSet[];
}

// RPC method definitions
const StartNotification = new NotificationType<StartParams>("start");
const NotifyFileChangesRequest = new RequestType<
  NotifyFileChangesParams,
  void,
  Error
>("analysis_engine.NotifyFileChanges");
const AnalyzeRequest = new RequestType<AnalyzeParams, AnalyzeResult, Error>(
  "analysis_engine.Analyze",
);
const ExecuteCommandRequest = new RequestType<unknown, unknown, Error>(
  "workspace/executeCommand",
);

export type AnalysisEvent =
  | {
      kind: "fileChange";
      data: FileChangeEvent;
    }
  | {
      kind: "triggerAnalysis";
      data: TriggerAnalysisEvent;
    };

export class AnalysisTasksProvider
  implements FileWatchCapable, TaskProvider<AnalyzerInitParams, void>
{
  readonly name = "analysis";
  private readonly processManager: ProcessManager;
  private readonly connectionManager: RPCConnectionManager;
  private readonly jdtlsConnectionManager: RPCConnectionManager;
  private readonly debouncer: EventDebouncer<AnalysisEvent>;
  private readonly analysisTasksManager: TasksStoreManager<
    AnalysisIncident,
    AnalysisTask
  >;
  private initParams: AnalyzerInitParams | null = null;
  private isServerRunning = false;
  private analysisReportDir: string = path.join(os.tmpdir(), "analyses");

  constructor(private readonly logger: Logger) {
    this.processManager = new ProcessManager(
      logger.child({ module: "AnalysisProcessManager" }),
    );
    this.connectionManager = new RPCConnectionManager(
      logger.child({ module: "AnalysisRPCConnectionManager" }),
    );
    this.jdtlsConnectionManager = new RPCConnectionManager(
      logger.child({ module: "JDTLSBridge" }),
    );
    this.analysisTasksManager = new TasksStoreManager(
      logger.child({ module: "AnalysisTasksStore" }),
      new AnalysisTaskFactory(),
    );
    this.logger = logger.child({ module: "AnalysisTasksProvider" });

    this.debouncer = new EventDebouncer<AnalysisEvent>(logger, {
      debounceMs: 3000,
      processor: this.runAnalysis.bind(this),
      filter: this.filterAnalysisEvents.bind(this),
      deduplicate: this.deduplicateAnalysisEvents.bind(this),
    });
  }

  async init(params: AnalyzerInitParams): Promise<void> {
    await this.validateInitParams(params);
    this.initParams = params;
    await this.startAnalyzerServer();
    // trigger an initial analysis
    this.runFullAnalysis();
    this.analysisReportDir = path.join(this.initParams.logDir, "analyses");
    await fsPromises.mkdir(this.analysisReportDir, { recursive: true });
  }

  async getCurrentTasks(): Promise<VersionedTasks> {
    await this.debouncer.waitUntilIdle(180000);
    return this.analysisTasksManager.getAllTasks();
  }

  async stop(): Promise<void> {
    this.logger.info("Stopping analysis provider");
    await this.debouncer.flush();
    await this.connectionManager.disconnect();
    await this.jdtlsConnectionManager.disconnect();
    await this.processManager.terminate();

    this.isServerRunning = false;
    this.logger.info("Analysis provider stopped");
  }

  async reset(): Promise<void> {
    this.analysisTasksManager.clearAllData();
    this.runFullAnalysis();
  }

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
    if (!params.workspacePaths || !params.workspacePaths.length) {
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
    if (!params.rulesPaths.length) {
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
    // try {
    //   const stat = await fsPromises.stat(params.pipePath);
    //   if (!stat.isFile()) {
    //     throw new Error("pipePath is not a file");
    //   }
    // } catch (error) {
    //   throw new Error(
    //     `Failed to validate pipePath: ${params.pipePath}: ${error}`,
    //   );
    // }
  }

  private async startAnalyzerServer(): Promise<void> {
    if (!this.initParams) {
      throw new Error("Analysis provider not initialized");
    }

    const logDir =
      this.initParams.logDir || path.join(os.tmpdir(), "analysis-logs");
    await fsPromises.mkdir(logDir, { recursive: true });
    this.logger.info("Starting analyzer RPC server", {
      logDir,
      pipePath: this.initParams.pipePath,
      workspacePaths: this.initParams.workspacePaths,
      rulesPaths: this.initParams.rulesPaths,
      targets: this.initParams.targets,
      sources: this.initParams.sources,
      analyzerBinaryPath: this.initParams.analyzerBinaryPath,
    });

    const pipeName = ProcessManager.generatePipeName();

    await this.processManager.spawn(
      this.initParams.analyzerBinaryPath,
      [
        "-pipePath",
        pipeName,
        "-rules",
        this.initParams.rulesPaths.join(","),
        "-source-directory",
        this.initParams.workspacePaths[0],
        "-log-file",
        path.join(logDir, "analysis.log"),
      ],
      {
        pipeName,
        cwd: logDir,
        onStderr: (data) => {
          this.logger.error("Analyzer stderr", { data });
        },
        onExit: (code, signal) => {
          this.logger.info("Analyzer process exited", { code, signal });
          this.isServerRunning = false;
        },
        onError: (error) => {
          this.logger.error("Analyzer process error", { error });
          this.isServerRunning = false;
        },
      },
    );

    if (!pipeName) {
      throw new Error("Failed to create pipe for analyzer communication");
    }

    // connect to analyzer pipe
    await (async () => {
      const maxRetries = 3;
      const tryConnect = async (attempt: number): Promise<void> => {
        try {
          await this.connectionManager.connectToPipe(pipeName);
        } catch (error) {
          if (attempt >= maxRetries) {
            throw new Error(
              `Failed to connect to analyzer pipe after ${maxRetries} attempts: ${error}`,
            );
          }
          this.logger.warn(
            `connectToPipe to analyzer failed, attempt ${attempt}. Retrying after debounce...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 750 * attempt)); // debounced wait
          return tryConnect(attempt + 1);
        }
      };
      return tryConnect(1);
    })();

    // Set up RPC bridge to forward workspace/executeCommand requests to JDTLS
    await this.setupJdtlsBridge();

    await this.connectionManager.sendNotification(StartNotification, {
      type: "start",
    });

    this.isServerRunning = true;
    this.logger.info("Analyzer RPC server started successfully", { pipeName });
  }

  private async setupJdtlsBridge(): Promise<void> {
    if (!this.initParams) {
      throw new Error("Analysis provider not initialized");
    }

    this.logger.info("Setting up JDTLS bridge", {
      pipePath: this.initParams.pipePath,
    });

    // Connect to the JDTLS pipe
    await this.jdtlsConnectionManager.connectToPipe(this.initParams.pipePath);

    // Set up request handler for workspace/executeCommand from analyzer
    // forward requests to JDTLS pipe
    this.connectionManager.onRequest(
      ExecuteCommandRequest,
      async (params: unknown) => {
        this.logger.silly(
          "Forwarding workspace/executeCommand to JDTLS",
          params,
        );

        try {
          const result = await this.jdtlsConnectionManager.sendRequest(
            ExecuteCommandRequest,
            params,
          );
          this.logger.silly("Received response from JDTLS", { result });
          return result;
        } catch (error) {
          this.logger.error(
            "Failed to forward workspace/executeCommand to JDTLS",
            { error, params },
          );
          throw error;
        }
      },
    );

    this.logger.info("JDTLS bridge setup completed");
  }

  isInitialized(): boolean {
    return this.isServerRunning && this.connectionManager.isConnected();
  }

  async onFileChange(event: FileChangeEvent): Promise<void> {
    this.debouncer.addEvent({
      kind: "fileChange",
      data: event,
    });
  }

  private async runAnalysis(events: AnalysisEvent[]): Promise<void> {
    if (!this.isInitialized() || !this.initParams) {
      this.logger.warn("Analysis provider not initialized, skipping analysis");
      return;
    }

    this.logger.info("AnalysisProvider running analysis for file changes", {
      changeCount: events.length,
    });
    const fileChanges = events
      .filter((event) => event.kind === "fileChange")
      .map((event) => event.data as FileChangeEvent);
    const triggerAnalysis = events
      .filter((event) => event.kind === "triggerAnalysis")
      .map((event) => event.data as TriggerAnalysisEvent);
    try {
      if (triggerAnalysis?.length) {
        if (fileChanges.length) {
          await this.notifyFileChanges(fileChanges);
        }
        await this.performAnalysis([]);
      } else if (fileChanges.length) {
        await this.notifyFileChanges(fileChanges);
        await this.performAnalysis(fileChanges);
      }
      this.logger.info("AnalysisProvider analysis completed successfully", {
        changeCount: events.length,
      });
    } catch (error) {
      this.logger.error("Analysis failed", {
        error,
        changeCount: events.length,
      });
    }
  }

  private async notifyFileChanges(events: FileChangeEvent[]): Promise<void> {
    const changes = await Promise.all(
      events
        .filter((event) => event.type !== "deleted")
        .map(async (event) => {
          let content = "";
          try {
            content = await fsPromises.readFile(event.path, "utf-8");
          } catch (error) {
            this.logger.warn("Failed to read file", {
              error,
              path: event.path,
            });
            content = "";
          }
          return {
            path: event.path,
            content,
            saved: true,
          };
        }),
    );

    try {
      await this.connectionManager.sendRequest(NotifyFileChangesRequest, {
        changes: changes,
      });
      this.logger.debug("Notified analyzer of file changes", {
        changeCount: changes.length,
      });
    } catch (error) {
      this.logger.error("Failed to notify file changes", { error });
    }
  }

  private async performAnalysis(events: FileChangeEvent[]): Promise<void> {
    if (!this.initParams) {
      throw new Error("Analysis provider not initialized");
    }

    const labelSelector = this.buildLabelSelector();

    const includedPaths =
      events.length > 0 ? events.map((event) => event.path) : undefined;

    const analysisParams = {
      label_selector: labelSelector,
      included_paths: includedPaths,
      reset_cache: !includedPaths, // Reset cache for full analysis
      excluded_paths: this.initParams.excludedPaths || [],
    };

    this.logger.info("Sending analysis request", { params: analysisParams });

    try {
      const result = await this.connectionManager.sendRequest(
        AnalyzeRequest,
        analysisParams,
      );

      const incidentsByUri = new Map<string, AnalysisIncident[]>();
      for (const ruleSet of result.Rulesets) {
        if (ruleSet.violations) {
          for (const [ruleName, violation] of Object.entries(
            ruleSet.violations,
          )) {
            if (violation.incidents) {
              for (const incident of violation.incidents) {
                const uri = incident.uri;
                if (!incidentsByUri.has(uri)) {
                  incidentsByUri.set(uri, []);
                }
                const enhancedIncident: AnalysisIncident = {
                  ...incident,
                  ruleSet: ruleSet.name,
                  rule: ruleName,
                  category: violation.category || incident.category,
                  description: violation.description,
                };
                incidentsByUri.get(uri)!.push(enhancedIncident);
              }
            }
          }
        }
      }
      this.logger.debug("Updating analysis tasks", {
        totalUris: incidentsByUri.size,
        totalIncidents: Array.from(incidentsByUri.values()).reduce(
          (acc, incidents) => acc + incidents.length,
          0,
        ),
      });

      // Clear all data once before updating with new analysis results
      this.analysisTasksManager.clearAllData();

      for (const [uri, incidents] of incidentsByUri) {
        this.analysisTasksManager.updateData(uri, incidents);
      }
      const formattedDate = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d+Z$/, "Z");

      await this.writeAnalysisResult(
        result,
        path.join(this.analysisReportDir, `analysis_${formattedDate}.json`),
      );
    } catch (error) {
      this.logger.error("Analysis request failed", { error });
      throw error;
    }
  }

  private async writeAnalysisResult(
    result: AnalyzeResult,
    fPath: string,
  ): Promise<void> {
    try {
      await fsPromises.writeFile(
        fPath,
        JSON.stringify(result, null, 2),
        "utf-8",
      );
    } catch (error) {
      this.logger.error("Failed to write analysis result to file", {
        error,
        path: fPath,
      });
      throw error;
    }
  }

  private buildLabelSelector(): string {
    if (!this.initParams) {
      throw new Error("Analysis provider not initialized");
    }
    const targets = this.initParams.targets
      .map((target) => `konveyor.io/target=${target}`)
      .join(" || ");
    const sources = this.initParams.sources
      .map((source) => `konveyor.io/source=${source}`)
      .join(" || ");
    return `${targets} ${sources ? `&& ${sources}` : ""}`;
  }

  private filterAnalysisEvents(events: AnalysisEvent[]): AnalysisEvent[] {
    const fileChanges = events
      .filter((event) => event.kind === "fileChange")
      .map((event) => event);
    const triggerAnalysis = events
      .filter((event) => event.kind === "triggerAnalysis")
      .map((event) => event)
      .sort((a, b) => b.data.timestamp.getTime() - a.data.timestamp.getTime());
    const relevantExtensions = [
      ".java",
      ".xml",
      ".properties",
      ".gradle",
      ".pom",
      ".json",
      ".yaml",
    ];
    const filteredEvents: AnalysisEvent[] = [];

    filteredEvents.push(
      ...fileChanges.filter((event) => {
        const hasRelevantExtension = relevantExtensions.some((ext) =>
          event.data.path.toLowerCase().endsWith(ext),
        );

        // Also include if it's a build file
        const isBuildFile = event.data.path.match(
          /\/(pom\.xml|build\.gradle|gradle\.properties)$/,
        );

        return hasRelevantExtension || isBuildFile;
      }),
    );
    if (triggerAnalysis.length) {
      // Only keep the most recent trigger analysis event
      filteredEvents.push(triggerAnalysis[0]);
    }

    return filteredEvents;
  }

  private deduplicateAnalysisEvents(events: AnalysisEvent[]): AnalysisEvent[] {
    const eventMap = new Map<string, AnalysisEvent>();
    events.forEach((event) => {
      if (event.kind === "fileChange") {
        const existing = eventMap.get(event.data.path);
        if (!existing || event.data.timestamp > existing.data.timestamp) {
          eventMap.set(event.data.path, event);
        }
      }
      if (event.kind === "triggerAnalysis") {
        eventMap.set("___triggerAnalysis___", event);
      }
    });
    return Array.from(eventMap.values());
  }

  public runFullAnalysis() {
    this.debouncer.addEvent({
      kind: "triggerAnalysis",
      data: {
        includedPaths: [],
        excludedPaths: [],
        resetCache: true,
        timestamp: new Date(),
      } as TriggerAnalysisEvent,
    });
  }
}
