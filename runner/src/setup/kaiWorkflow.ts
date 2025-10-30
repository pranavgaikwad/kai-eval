import {
  SolutionServerClient,
  InMemoryCacheWithRevisions,
  FileBasedResponseCache,
} from "@editor-extensions/agentic";

import {
  type KaiWorkflowSetupConfig,
  type KaiWorkflowSetupResult,
} from "./types";
import {
  KaiWorkflowManager,
  type KaiWorkflowManagerOptions,
  createModelProvider,
} from "../kai";

export async function setupKaiWorkflow(
  config: KaiWorkflowSetupConfig,
): Promise<KaiWorkflowSetupResult> {
  const logger = config.logger.child({ module: "KaiSetup" });
  logger.info("Setting up Kai workflow system");

  const env = config.env || (process.env as Record<string, string>);

  try {
    if (!config.modelConfig) {
      throw new Error("Model configuration is required");
    }
    const modelConfig = config.modelConfig;

    logger.info("Creating model provider", {
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
        url: config.solutionServerUrl || "",
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
      config.taskManager,
      config.logDir,
    );

    const workflowOptions: KaiWorkflowManagerOptions = {
      logger,
      workspaceDir: config.workspaceDir,
      modelProvider,
      solutionServerClient,
      fsCache,
      toolCache,
      filterTasksFunc: config.filterTasksFunc,
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
