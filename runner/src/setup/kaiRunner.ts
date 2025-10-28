import * as os from "os";
import * as path from "path";

import { EnhancedIncident } from "@editor-extensions/shared";

import { setupKaiWorkflow } from "./kaiWorkflow";
import { setupProviders } from "./providers";
import {
  KaiWorkflowSetupConfig,
  TaskProviderSetupConfig,
  KaiRunnerSetupResult,
  RunKaiWorkflowInput,
} from "./types";
import { FilterTasksFunction } from "../kai";
import { TaskManager } from "../taskManager";
import { AnalysisTask } from "../taskProviders";
import { KaiRunnerConfig } from "../types";
import { createOrderedLogger } from "../utils/logger";

export async function setupKaiRunner(
  config: KaiRunnerConfig,
  env: Record<string, string> = process.env as Record<string, string>,
  storeSnapshots: boolean = false,
  filterTasksFunc?: FilterTasksFunction,
): Promise<KaiRunnerSetupResult> {
  // Validate required configuration
  if (!config.workspacePaths || config.workspacePaths.length === 0) {
    throw new Error("workspacePaths must be provided in config");
  }

  if (!config.models || config.models.length === 0) {
    throw new Error("models must be specified in config");
  }

  // TODO (pgaikwad): re-visit when adding multi-workspace support
  const workspaceDir = config.workspacePaths[0];

  const logDir =
    config.logDir || path.join(os.tmpdir(), `kai-runner-logs-${Date.now()}`);

  const defaultLogLevels = { console: "info", file: "debug" };
  const logLevels = config.logLevel || defaultLogLevels;

  const logger = createOrderedLogger(
    logLevels.console,
    logLevels.file,
    path.join(logDir, "kai-runner.log"),
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

  if (
    !providersSetup.providers.analysis ||
    !providersSetup.providers.diagnostics
  ) {
    throw new Error("Failed to initialize providers");
  }

  // Step 2: Setup task manager
  logger.info("Setting up task manager");
  const taskManager = new TaskManager(
    logger,
    [providersSetup.providers.analysis, providersSetup.providers.diagnostics],
    logDir,
    storeSnapshots,
  );

  // Step 3: Setup Kai workflow manager
  logger.info("Setting up Kai workflow manager");

  const kaiConfig: KaiWorkflowSetupConfig = {
    workspaceDir,
    logger,
    taskManager,
    modelConfig: {
      provider: config.models[0].provider,
      args: config.models[0].args,
    },
    env,
    solutionServerUrl: config.solutionServerUrl,
    logDir,
    filterTasksFunc,
  };

  const kaiSetup = await setupKaiWorkflow(kaiConfig);
  logger.info("Kai runner setup complete");

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

  const runFunc = async function (inp: RunKaiWorkflowInput): Promise<void> {
    // get analysis tasks and ensure given issues are present in analysis tasks
    const snapshotId = await taskManager.getTasks();
    const compareResult = taskManager.getTasksDiff(snapshotId);
    if (
      !compareResult ||
      (!compareResult.added.length && !compareResult.unresolved.length)
    ) {
      throw new Error("No analysis tasks found");
    }
    // filter tasks of type AnalysisTask
    const analysisTasks: AnalysisTask[] = compareResult.added.filter(
      (task) => task instanceof AnalysisTask,
    );
    const unresolvedAnalysisTasks = compareResult.unresolved.filter(
      (task) => task instanceof AnalysisTask,
    );
    const allTasks = [...analysisTasks, ...unresolvedAnalysisTasks];
    const foundAnalysisTasks = allTasks.filter((task) =>
      inp.data.rules.some(
        (rule) =>
          rule.rule === task.getIncident().rule &&
          rule.ruleset === task.getIncident().ruleSet,
      ),
    );
    if (!foundAnalysisTasks.length) {
      throw new Error("No matching analysis tasks found");
    }
    const incidents = foundAnalysisTasks.map((task: AnalysisTask) => {
      return {
        violationId: task.getIncident().rule,
        uri: task.getUri(),
        message: task.getIncident().message,
        activeProfileName: undefined,
        solutionServerIncidentId: undefined,
        ruleset_name: task.getIncident().ruleSet,
        ruleset_description: undefined,
        violation_name: task.getIncident().rule,
        violation_description: task.getIncident().description,
        violation_category: task.getIncident().category,
      } as EnhancedIncident;
    });
    return await kaiSetup.kaiWorkflowManager.executeWorkflow({
      enableAgentMode: inp.data.agentMode,
      migrationHint: inp.data.migrationHint,
      programmingLanguage: inp.data.programmingLanguage,
      incidents,
    });
  };

  return {
    logger,
    providersSetup,
    kaiSetup,
    taskManager,
    shutdown,
    runFunc,
  };
}
