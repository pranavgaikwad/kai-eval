import * as os from "os";
import * as path from "path";

import {
  type GetTaskManagerFunction,
  type KaiRunnerFunction,
} from "src/eval/types";
import { type Logger } from "winston";

import { type TasksInteractionResolver, type FilteredTask } from "../kai";
import { type KaiRunnerConfig } from "../types";
import { setupKaiRunner, getKaiWorkflowStarterFunction } from "./kaiRunner";
import { setupKaiWorkflow } from "./kaiWorkflow";
import { setupProviders } from "./providers";
import {
  type RunKaiWorkflowInput,
  type KaiEvalSetupConfig,
  type KaiEvalSetupResult,
} from "./types";
import { OptimizedEvaluationRunner } from "../eval/optimizedRunner";
import {
  type TestCase,
  type TestApplication,
  type TestCaseVariant,
} from "../eval/types";
import { TaskManager } from "../taskManager";
import { AnalysisTask, type Task } from "../taskProviders";
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
  const { config, storeSnapshots = false } = setupConfig;

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

  const { getTaskManager, kaiRunner } =
    setupLocalKaiRunnerForEvalV2(storeSnapshots);

  const evaluationRunner = new OptimizedEvaluationRunner(
    config,
    getTaskManager,
    kaiRunner,
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
  agentTasksProviderFunc?: TasksInteractionResolver,
): {
  getTaskManagerFunc: GetTaskManagerFunction;
  kaiRunner: KaiRunnerFunction;
} {
  let runKaiWorkflowFunc: (inp: RunKaiWorkflowInput) => Promise<void>;
  const getTaskManagerFunc = async (
    logger: Logger,
    config: KaiRunnerConfig,
  ): Promise<{
    taskManager: TaskManager;
    shutdownFunc: () => Promise<void>;
  }> => {
    const { taskManager, runFunc, shutdown } = await setupKaiRunner(
      config,
      process.env as Record<string, string>,
      storeSnapshots,
      agentTasksProviderFunc,
    );
    runKaiWorkflowFunc = runFunc;
    return { taskManager, shutdownFunc: shutdown };
  };

  const kaiRunner: KaiRunnerFunction = async (
    _logger: Logger,
    testCase: TestCase,
    application: TestApplication,
    variant: TestCaseVariant,
    _config: KaiRunnerConfig,
  ) => {
    return await runKaiWorkflowFunc({
      kind: "fixByRules",
      data: {
        rules: testCase.rules,
        migrationHint: testCase.migrationHint,
        programmingLanguage: application.programmingLanguage,
        agentMode: variant.agentMode,
      },
    });
  };

  return {
    getTaskManagerFunc,
    kaiRunner,
  };
}

export function setupLocalKaiRunnerForEvalV2(storeSnapshots: boolean = false): {
  getTaskManager: GetTaskManagerFunction;
  kaiRunner: KaiRunnerFunction;
} {
  let availableTaskManager: TaskManager;
  const getTaskManager: GetTaskManagerFunction = async (
    logger: Logger,
    config: KaiRunnerConfig,
  ) => {
    if (!config.workspacePaths || !config.workspacePaths.length) {
      throw new Error("workspacePaths must be provided in config");
    }
    const logDir =
      config.logDir || path.join(os.tmpdir(), `kai-runner-logs-${Date.now()}`);
    const providersSetup = await setupProviders({
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
    });
    const taskManager = new TaskManager(
      logger,
      [
        providersSetup.providers.analysis!,
        providersSetup.providers.diagnostics!,
      ],
      logDir,
      storeSnapshots,
    );
    const shutdownFunc = async () => {
      await providersSetup.shutdown();
    };
    availableTaskManager = taskManager;
    return { taskManager, shutdownFunc };
  };

  const getTasksInteractionFunction = (
    logger: Logger,
    tc: TestCase,
    workspaceDir: string,
    seenTasks: Map<string, number>,
  ): TasksInteractionResolver => {
    return async (taskManager: TaskManager): Promise<FilteredTask[]> => {
      const baselineSnapshotId = taskManager.getBaselineSnapshotId();
      const baselineTasks =
        taskManager.getAllTasksForSnapshot(baselineSnapshotId);
      logger.debug("Baseline tasks retrieved for user interaction", {
        baselineSnapshotId,
        totalBaselineTasks: baselineTasks.length,
        testCase: tc.name,
      });
      const intendedToFixTasks = baselineTasks.filter((task) => {
        if (task instanceof AnalysisTask) {
          const incident = task.getIncident();
          return tc.rules.some(
            (rule) =>
              incident.ruleSet === rule.ruleset && incident.rule === rule.rule,
          );
        }
        return false;
      });
      const intendedToFixTaskIds = new Set(
        intendedToFixTasks.map((t) => t.getID()),
      );
      const currentSnapshotId = await taskManager.getTasks();
      const currentTasks =
        taskManager.getAllTasksForSnapshot(currentSnapshotId);
      // Find intended-to-fix tasks that are still unresolved
      const targetUnresolved = baselineTasks.filter(
        (task) =>
          intendedToFixTaskIds.has(task.getID()) &&
          currentTasks.some((current) => current.getID() === task.getID()),
      );

      // Find new issues introduced since baseline
      const newIssues = currentTasks.filter(
        (task) =>
          !baselineTasks.some((baseline) => baseline.getID() === task.getID()),
      );

      const combinedTasks = [...targetUnresolved, ...newIssues];
      const finalTasks = groupAndFilterTasks(
        combinedTasks,
        taskManager,
        seenTasks,
        workspaceDir,
      );
      logger.debug("Tasks filtered for user interaction", {
        finalTasks: finalTasks.length,
        testCase: tc.name,
      });
      return finalTasks;
    };
  };

  const kaiRunner: KaiRunnerFunction = async (
    logger: Logger,
    tc: TestCase,
    application: TestApplication,
    variant: TestCaseVariant,
    config: KaiRunnerConfig,
  ) => {
    if (!config.workspacePaths || !config.workspacePaths.length) {
      throw new Error("workspacePaths must be provided in config");
    }
    if (!config.models || !config.models.length) {
      throw new Error("models must be provided in config");
    }
    if (!availableTaskManager) {
      throw new Error("Task manager uninitialized");
    }
    const seenTasks = new Map<string, number>();
    const workspaceDir = config.workspacePaths[0];
    const logDir =
      config.logDir || path.join(os.tmpdir(), `kai-runner-logs-${Date.now()}`);
    const { kaiWorkflowManager } = await setupKaiWorkflow({
      workspaceDir,
      logger,
      taskManager: availableTaskManager,
      logDir,
      tasksUserInteractionFunction: getTasksInteractionFunction(
        logger,
        tc,
        workspaceDir,
        seenTasks,
      ),
      modelConfig: {
        provider: config.models[0].provider,
        args: config.models[0].args,
      },
    });
    const runFunc = getKaiWorkflowStarterFunction(
      availableTaskManager,
      kaiWorkflowManager,
    );
    const timeoutMs = tc.timeoutMs;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const runPromise = runFunc({
        kind: "fixByRules",
        data: {
          rules: tc.rules,
          migrationHint: tc.migrationHint,
          programmingLanguage: application.programmingLanguage,
          agentMode: variant.agentMode,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          logger.error("Kai workflow timed out", {
            timeoutMs,
            testCase: tc.name,
          });
          try {
            kaiWorkflowManager.cleanup();
          } finally {
            reject(new Error(`Kai workflow timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs);
      });

      await Promise.race([runPromise, timeoutPromise]);
    } catch (error) {
      kaiWorkflowManager.cleanup();
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      kaiWorkflowManager.cleanup();
    }
  };

  return {
    getTaskManager,
    kaiRunner,
  };
}

function groupAndFilterTasks(
  tasks: Task[],
  taskManager: TaskManager,
  seenTasks: Map<string, number>,
  workspaceDir: string,
): FilteredTask[] {
  const taskKey = (task: Task) => `${task.getUri()}::${task.toString()}`;

  const seen = new Set<string>();
  const uniqueTasks = tasks.filter((task) => {
    const key = taskKey(task);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const tasksByUri = new Map<string, Task[]>();

  for (const task of uniqueTasks) {
    let uri = task.getUri();
    if (
      path.isAbsolute(uri) ||
      uri.startsWith(`file://${workspaceDir}`) ||
      uri.startsWith(`file:///${workspaceDir}`)
    ) {
      uri = path.relative(workspaceDir, uri);
    }

    if (!tasksByUri.has(uri)) {
      tasksByUri.set(uri, []);
    }

    const uriTasks = tasksByUri.get(uri)!;
    if (uriTasks.length < 5) {
      uriTasks.push(task);
    }
    tasksByUri.set(uri, uriTasks);
  }

  const popped = [];
  // pick max 3 uris at a time
  {
    let selectedUris = 0;
    for (const [_uri, value] of tasksByUri) {
      if (selectedUris >= 3) {
        break;
      }
      if (!value || !value.length) {
        continue;
      }
      const filteredTasks = value.filter(
        (t) => (seenTasks.get(taskKey(t)) ?? 0) < 3,
      );
      if (!filteredTasks.length) {
        continue;
      }
      filteredTasks.forEach((t) =>
        seenTasks.set(taskKey(t), (seenTasks.get(taskKey(t)) ?? 0) + 1),
      );
      popped.push(
        ...filteredTasks.map((t) => ({
          uri: t.getUri(),
          task: t.toString(),
        })),
      );
      selectedUris++;
    }
  }
  return popped;
}
