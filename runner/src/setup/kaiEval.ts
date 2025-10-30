import * as os from "os";
import * as path from "path";

import {
  type GetTaskManagerAndKaiRunnerFunction,
  type KaiRunnerFunction,
} from "src/eval/types";
import { type AgentTasksProviderFunction } from "src/kai";
import { type KaiRunnerConfig } from "src/types";
import { type Logger } from "winston";

import { setupKaiRunner } from "./kaiRunner";
import {
  type RunKaiWorkflowInput,
  type KaiEvalSetupConfig,
  type KaiEvalSetupResult,
} from "./types";
import { DefaultEvaluationRunner } from "../eval/runner";
import { createOrderedLogger } from "../utils/logger";

/**
 * Sets up a Kai evaluation runner for running migration evaluation workflows
 *
 * @param setupConfig Configuration for the evaluation runner setup
 * @returns Promise<KaiEvalSetupResult> The configured evaluation runner and metadata
 */
export async function setupKaiEval(
  setupConfig: KaiEvalSetupConfig,
): Promise<KaiEvalSetupResult> {
  const {
    config,
    storeSnapshots = false,
    agentTasksProviderFunc,
  } = setupConfig;

  if (!config.models || config.models.length === 0) {
    throw new Error("Models must be specified in config for evaluation");
  }

  const hasEvaluationModel = config.models.some(
    (model) => model.useForEvaluation,
  );
  if (!hasEvaluationModel) {
    throw new Error(
      "No model configured for evaluation. Set useForEvaluation: true on one of the models in config.",
    );
  }

  const logDir =
    config.logDir || path.join(os.tmpdir(), `kai-eval-logs-${Date.now()}`);
  const defaultLogLevels = { console: "info", file: "debug" };
  const logLevels = config.logLevel || defaultLogLevels;

  const logger = createOrderedLogger(
    logLevels.console,
    logLevels.file,
    path.join(logDir, "kai-eval.log"),
  );

  logger.info("Setting up Kai evaluation runner", { config });

  const artifactsPath =
    setupConfig.artifactsPath || path.join(os.tmpdir(), "kai-eval-artifacts");

  const getTaskManagerAndKaiRunnerFunc = setupLocalKaiRunnerForEval(
    storeSnapshots,
    agentTasksProviderFunc,
  );

  const evaluationRunner = new DefaultEvaluationRunner(
    config,
    getTaskManagerAndKaiRunnerFunc,
    logger,
    artifactsPath,
  );

  logger.info("Kai evaluation runner setup complete", {
    artifactsPath,
    hasEvaluationModel,
    modelCount: config.models.length,
  });

  return {
    evaluationRunner,
  };
}

export function setupLocalKaiRunnerForEval(
  storeSnapshots: boolean = false,
  agentTasksProviderFunc?: AgentTasksProviderFunction,
): GetTaskManagerAndKaiRunnerFunction {
  const getTaskManagerAndKaiRunnerFunc = async (
    logger: Logger,
    config: KaiRunnerConfig,
  ) => {
    const { taskManager, runFunc, shutdown } = await setupKaiRunner(
      config,
      process.env as Record<string, string>,
      storeSnapshots,
      agentTasksProviderFunc,
    );
    const kaiRunner: KaiRunnerFunction = async ({
      tc,
      application,
      variant,
    }) => {
      const inp: RunKaiWorkflowInput = {
        kind: "fixByRules",
        data: {
          rules: tc.rules,
          migrationHint: tc.migrationHint,
          programmingLanguage: application.programmingLanguage,
          agentMode: variant.agentMode,
        },
      };
      return await runFunc(inp);
    };
    return { taskManager, kaiRunner, shutdownFunc: shutdown };
  };

  return getTaskManagerAndKaiRunnerFunc;
}
