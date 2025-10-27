import * as os from "os";
import * as path from "path";

import { Logger } from "winston";
import { KaiInteractiveWorkflowInput } from "@editor-extensions/agentic";

import { setupKaiWorkflow, KaiWorkflowSetupConfig } from "./kaiWorkflow";
import { setupProviders, TaskProviderSetupConfig } from "./providers";
import { TaskManager } from "../taskManager/taskManager";
import { KaiRunnerConfig } from "../types";
import { createOrderedLogger } from "../utils/logger";

export interface KaiRunnerSetupResult {
  logger: Logger;
  providersSetup: Awaited<ReturnType<typeof setupProviders>>;
  kaiSetup: Awaited<ReturnType<typeof setupKaiWorkflow>>;
  taskManager: TaskManager;
  shutdown: () => Promise<void>;
}

export async function setupKaiRunner(
  config: KaiRunnerConfig,
  input: KaiInteractiveWorkflowInput,
  env: Record<string, string> = process.env as Record<string, string>
): Promise<KaiRunnerSetupResult> {

  // Validate required configuration
  if (!config.workspacePaths || config.workspacePaths.length === 0) {
    throw new Error("workspacePaths must be provided in config");
  }

  if (!config.modelProvider) {
    throw new Error("modelProvider must be specified in config");
  }

  // TODO (pgaikwad): re-visit when adding multi-workspace support
  const workspaceDir = config.workspacePaths[0];

  const logDir = config.logDir || path.join(os.tmpdir(), `kai-runner-logs-${Date.now()}`);

  const defaultLogLevels = { console: "info", file: "debug" };
  const logLevels = config.logLevel || defaultLogLevels;

  const logger = createOrderedLogger(
    logLevels.console,
    logLevels.file,
    path.join(logDir, "kai-runner.log")
  );

  logger.info("Starting Kai runner", { config });

  // Step 1: Setup task providers
  logger.info("Setting up task providers");
  const providerConfig: TaskProviderSetupConfig = {
    workspacePaths: config.workspacePaths,
    logger,
    ...(config.jdtlsBinaryPath && {
      diagnosticsParams: {
        jdtlsBinaryPath: config.jdtlsBinaryPath,
        jdtlsBundles: config.jdtlsBundles || [],
        jvmMaxMem: config.jvmMaxMem,
        logDir,
      },
    }),
    ...(config.kaiAnalyzerRpcPath && {
      analysisParams: {
        analyzerBinaryPath: config.kaiAnalyzerRpcPath,
        rulesPaths: config.rulesPaths || [],
        targets: config.targets || [],
        sources: config.sources || [],
        logDir,
      },
    }),
  };

  const providersSetup = await setupProviders(providerConfig);

  if (!providersSetup.providers.analysis || !providersSetup.providers.diagnostics) {
    throw new Error("Failed to initialize providers");
  }

  // Step 2: Setup task manager
  logger.info("Setting up task manager");
  const taskManager = new TaskManager(logger, [
    providersSetup.providers.analysis,
    providersSetup.providers.diagnostics,
  ]);

  // Step 3: Setup Kai workflow manager
  logger.info("Setting up Kai workflow manager");

  const kaiConfig: KaiWorkflowSetupConfig = {
    workspaceDir,
    logger,
    taskManager,
    modelConfig: {
      provider: config.modelProvider,
      args: config.modelArgs || {},
    },
    env,
    solutionServerUrl: config.solutionServerUrl,
    logDir,
  };

  const kaiSetup = await setupKaiWorkflow(kaiConfig);
  logger.info("Kai runner setup complete");

  const tasks = await taskManager.getTasks();
  if (!tasks || !tasks.added.length) {
    throw new Error("No tasks found");
  }

  // Create shutdown function
  const shutdown = async () => {
    logger.info("Shutting down Kai runner");
    try {
      await kaiSetup.shutdown();
      await providersSetup.shutdown();
      logger.info("Kai runner shutdown complete");
    } catch (error) {
      logger.error("Error during shutdown", { error });
      throw error;
    }
  };

  return {
    logger,
    providersSetup,
    kaiSetup,
    taskManager,
    shutdown,
  };
}