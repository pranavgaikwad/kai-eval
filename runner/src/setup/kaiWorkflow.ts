import {
  SolutionServerClient,
  InMemoryCacheWithRevisions,
  FileBasedResponseCache,
} from "@editor-extensions/agentic";
import { type Logger } from "winston";

import {
  KaiWorkflowManager,
  type KaiWorkflowManagerOptions,
  type SupportedModelProviders,
  type TasksInteractionResolver,
  createModelProvider,
} from "../kai";
import { type TaskManager } from "../taskManager";

interface KaiWorkflowSetupOptions {
  workspaceDir: string;
  logger: Logger;
  taskManager: TaskManager;
  modelConfig?: {
    provider: SupportedModelProviders;
    args: Record<string, unknown>;
  };
  env?: Record<string, string>;
  solutionServerUrl?: string;
  logDir: string;
  /*
   * a function that sends tasks to the kai workflow when it requests diagnostics
   */
  tasksInteractionResolver?: TasksInteractionResolver;
}

export async function setupKaiWorkflow(opts: KaiWorkflowSetupOptions): Promise<{
  kaiWorkflowManager: KaiWorkflowManager;
  shutdown: () => Promise<void>;
}> {
  const logger = opts.logger.child({ module: "KaiSetup" });
  logger.info("Setting up Kai workflow system");

  const env = opts.env || (process.env as Record<string, string>);

  try {
    if (!opts.modelConfig) {
      throw new Error("Model configuration is required");
    }
    const modelConfig = opts.modelConfig;

    logger.silly("Creating model provider", {
      provider: modelConfig.provider,
      modelArgs: Object.keys(modelConfig.args),
    });

    const modelProvider = await createModelProvider(
      modelConfig.provider,
      modelConfig.args,
      env,
      logger,
    );

    logger.info("Creating solution server client");

    const solutionServerClient = new SolutionServerClient(
      {
        enabled: false,
        auth: {
          enabled: false,
          realm: "",
          insecure: false,
        },
        url: opts.solutionServerUrl || "",
      },
      logger,
    );

    const fsCache = new InMemoryCacheWithRevisions<string, string>(false);
    const toolCache = new FileBasedResponseCache<
      Record<string, unknown>,
      string
    >(
      false,
      (input: string | Record<string, unknown>) => JSON.stringify(input),
      (input: string) => JSON.parse(input),
    );

    logger.info("Creating Kai workflow manager");

    const kaiWorkflowManager = new KaiWorkflowManager(
      logger,
      opts.taskManager,
      opts.logDir,
    );

    const workflowOptions: KaiWorkflowManagerOptions = {
      logger,
      workspaceDir: opts.workspaceDir,
      modelProvider,
      solutionServerClient,
      fsCache,
      toolCache,
      filterTasksFunc: opts.tasksInteractionResolver,
    };

    logger.info("Initializing Kai workflow");

    await kaiWorkflowManager.init(workflowOptions);

    const shutdown = async (): Promise<void> => {
      logger.info("Shutting down Kai workflow system");

      try {
        kaiWorkflowManager.cleanup();
        logger.info("Kai workflow manager cleaned up");

        logger.info("Kai workflow system shutdown complete");
      } catch (error) {
        logger.error("Error during Kai shutdown", { error });
        throw error;
      }
    };

    logger.info("Kai workflow system setup complete");

    return {
      kaiWorkflowManager,
      shutdown,
    };
  } catch (error) {
    logger.error("Error during Kai setup", { error });
    throw error;
  }
}
