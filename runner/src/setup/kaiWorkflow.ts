import {
  SolutionServerClient,
  InMemoryCacheWithRevisions,
  FileBasedResponseCache,
} from "@editor-extensions/agentic";
import { Logger } from "winston";

import { KaiWorkflowManager, KaiWorkflowManagerOptions } from "../kai/kaiWorkflowManager";
import { createModelProvider, SupportedModelProviders } from "../kai/modelProvider";
import { TaskManager } from "../taskManager";

interface ModelConfig {
  provider: SupportedModelProviders;
  args: Record<string, unknown>;
}

export interface KaiWorkflowSetupConfig {
  workspaceDir: string;
  logger: Logger;
  taskManager: TaskManager;
  modelConfig?: ModelConfig;
  env?: Record<string, string>;
  solutionServerUrl?: string;
  logDir: string;
}


export interface KaiSetupResult {
  kaiWorkflowManager: KaiWorkflowManager;
  shutdown: () => Promise<void>;
}

export async function setupKaiWorkflow(config: KaiWorkflowSetupConfig): Promise<KaiSetupResult> {
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
      modelArgs: Object.keys(modelConfig.args)
    });

    const modelProvider = await createModelProvider(
      modelConfig.provider,
      modelConfig.args,
      env,
      logger
    );

    logger.info("Creating solution server client");

    const solutionServerClient = new SolutionServerClient(
      config.solutionServerUrl || "http://localhost:8080",
      logger
    );

    const fsCache = new InMemoryCacheWithRevisions<string, string>(false);
    const toolCache = new FileBasedResponseCache<Record<string, unknown>, string>(
      false,
      (input: string | Record<string, unknown>) => JSON.stringify(input),
      (input: string) => JSON.parse(input),
    );

    logger.info("Creating Kai workflow manager");

    const kaiWorkflowManager = new KaiWorkflowManager(
      logger,
      config.taskManager,
      config.logDir
    );

    const workflowOptions: KaiWorkflowManagerOptions = {
      logger,
      workspaceDir: config.workspaceDir,
      modelProvider,
      solutionServerClient,
      fsCache,
      toolCache,
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