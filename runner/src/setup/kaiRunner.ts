import * as os from "os";
import * as path from "path";

import { type EnhancedIncident } from "@editor-extensions/shared";
import { type Logger } from "winston";

import { setupKaiWorkflow } from "./kaiWorkflow";
import { setupProviders } from "./providers";
import { type RunKaiWorkflowInput } from "./types";
import { type KaiWorkflowManager, type TasksInteractionResolver } from "../kai";
import { TaskManager } from "../taskManager";
import { AnalysisTask } from "../taskProviders";
import type { KaiRunnerConfig } from "../types";
import { createOrderedLogger } from "../utils/logger";

interface KaiRunnerSetupOptions {
  config: KaiRunnerConfig;
  env: Record<string, string>;
  programmingLanguage: string;
  tasksInteractionResolver?: TasksInteractionResolver;
  logger?: Logger;
}

/**
 * This sets up everything needed to run Kai and generate fixes - kai workflow, task manager.
 * @param opts - kai runner setup options
 * @returns shutdownFunc for graceful cleanup and runFunc to trigger kai workflow with input
 */
export async function setupKaiRunner(opts: KaiRunnerSetupOptions): Promise<{
  shutdownFunc: () => Promise<void>;
  runFunc: (inp: RunKaiWorkflowInput) => Promise<void>;
}> {
  const { config, env, programmingLanguage, tasksInteractionResolver } = opts;

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
  config.logDir = logDir;
  const logLevels = config.logLevel || { console: "info", file: "debug" };
  config.logLevel = logLevels;

  const logger =
    opts.logger ||
    createOrderedLogger(
      logLevels.console,
      logLevels.file,
      path.join(logDir, "kai-runner.log"),
    );

  logger.info("Starting Kai runner", { config });

  logger.info("Setting up task providers");
  const providersSetup = await setupProviders({
    config,
    programmingLanguage,
    logger,
  });
  if (!providersSetup || !providersSetup.providers.length) {
    throw new Error("Failed to initialize providers");
  }

  logger.info("Setting up task manager");
  const taskManager = new TaskManager(logger, providersSetup.providers);

  logger.info("Setting up Kai workflow manager");
  const kaiSetup = await setupKaiWorkflow({
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
    tasksInteractionResolver: tasksInteractionResolver,
  });
  logger.info("Kai runner setup complete");

  // Create shutdown function
  const shutdownFunc = async () => {
    logger.info("Shutting down Kai runner");
    try {
      await kaiSetup.shutdown();
      await providersSetup.shutdownFunc();
      logger.info("Kai runner shutdown complete");
    } catch (error) {
      logger.error("Error during shutdown", { error });
      throw error;
    }
  };

  const runFunc = getKaiWorkflowStarterFunction(
    taskManager,
    kaiSetup.kaiWorkflowManager,
  );

  return {
    shutdownFunc,
    runFunc,
  };
}

/**
 * This returns a function that can be used to start a kai workflow
 * The function takes as input "seed rules" and checks if those rules
 * are present in the analysis tasks we got from the task manager.
 * @param taskManager - Task manager to get tasks from
 * @param kaiSetup - Kai setup to execute workflow
 * @returns
 */
export function getKaiWorkflowStarterFunction(
  taskManager: TaskManager,
  kaiWorkflowManager: KaiWorkflowManager,
): (inp: RunKaiWorkflowInput) => Promise<void> {
  return async (inp: RunKaiWorkflowInput) => {
    // get analysis tasks and ensure given issues are present in analysis tasks
    const snapshotId = await taskManager.getTasks();
    const tasks = taskManager.getAllTasksForSnapshot(snapshotId);
    if (!tasks.length) {
      throw new Error("No analysis tasks found");
    }
    const allTasks = tasks.filter((task) => task instanceof AnalysisTask);
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
    return await kaiWorkflowManager.executeWorkflow({
      enableAgentMode: inp.data.agentMode,
      migrationHint: inp.data.migrationHint,
      programmingLanguage: inp.data.programmingLanguage,
      incidents,
    });
  };
}
