import os from "os";
import path from "path";

import { type Logger } from "winston";

import {
  AnalysisTasksProvider,
  JavaDiagnosticsTasksProvider,
  type TaskProvider,
} from "../taskProviders";
import { type KaiRunnerConfig } from "../types";
import { isFileWatchCapable, SharedFileWatcher } from "../utils/fsWatch";
import { createOrderedLogger } from "../utils/logger";
import { getExcludedPaths } from "../utils/paths";

interface ProviderSetupOptions {
  config: KaiRunnerConfig;
  programmingLanguage: string;
  logger?: Logger;
}

const supportedProgrammingLanguages: string[] = ["java"];

export async function setupProviders(opts: ProviderSetupOptions): Promise<{
  providers: TaskProvider[];
  shutdownFunc: () => Promise<void>;
}> {
  const { config } = opts;
  const programmingLanguage = opts.programmingLanguage.toLowerCase();

  if (
    !supportedProgrammingLanguages.includes(programmingLanguage.toLowerCase())
  ) {
    throw new Error(
      `Unsupported programming language: ${programmingLanguage.toLowerCase()}`,
    );
  }

  if (!config.workspacePaths || !config.workspacePaths.length) {
    throw new Error("workspacePaths must be provided");
  }

  const logDir =
    config.logDir ||
    path.join(os.tmpdir(), `setup-providers-logs-${Date.now()}`);
  config.logDir = logDir;

  const logger = opts.logger
    ? opts.logger.child({ module: "ProvidersSetup" })
    : createOrderedLogger(
        config.logLevel?.console || "info",
        config.logLevel?.file || "debug",
        path.join(logDir, "providers.log"),
      );

  const fileWatcher = SharedFileWatcher.getInstance(
    logger,
    config.workspacePaths,
  );

  logger.info("Setting up task management");

  const providers: TaskProvider[] = [];
  const shutdownFuncs: (() => Promise<void>)[] = [];
  switch (programmingLanguage) {
    case "java": {
      const javaProviders = await setupJavaProviders(logger, config);
      providers.push(...javaProviders.providers);
      shutdownFuncs.push(javaProviders.shutdownFunc);
      break;
    }
  }

  providers.forEach((provider) => {
    if (isFileWatchCapable(provider)) {
      fileWatcher.registerProvider(provider);
    }
  });

  logger.info("Starting file watcher", {
    paths: config.workspacePaths,
  });
  await fileWatcher.start();

  const shutdownFunc = async (): Promise<void> => {
    logger.info("Shutting down task providers");
    try {
      await fileWatcher.stop();
      logger.info("File watcher stopped");

      shutdownFuncs.forEach(async (shutdownFunc) => {
        await shutdownFunc();
      });

      logger.info("All providers stopped");
    } catch (error) {
      logger.error("Error during shutdown", { error });
      throw error;
    }
  };

  logger.info("Task providers setup complete", {
    providerCount: providers.length,
  });

  return {
    providers,
    shutdownFunc,
  };
}

async function setupJavaProviders(
  logger: Logger,
  config: KaiRunnerConfig,
): Promise<{
  providers: TaskProvider[];
  shutdownFunc: () => Promise<void>;
}> {
  if (!config.workspacePaths || config.workspacePaths.length === 0) {
    throw new Error("workspacePaths must be provided and non-empty");
  }
  if (!config.jdtlsBinaryPath) {
    throw new Error("jdtlsBinaryPath must be provided");
  }
  if (!config.jdtlsBundles) {
    throw new Error("jdtlsBundles must be provided");
  }
  if (!config.jvmMaxMem) {
    throw new Error("jvmMaxMem must be provided");
  }
  if (!config.kaiAnalyzerRpcPath) {
    throw new Error("kaiAnalyzerRpcPath must be provided");
  }
  if (!config.rulesPaths) {
    throw new Error("rulesPaths must be provided");
  }
  if (!config.targets) {
    throw new Error("targets must be provided");
  }
  if (!config.sources) {
    throw new Error("sources must be provided");
  }
  // We share the pipe between analysis and java diagnostics providers
  let pipeName: string | undefined;
  let diagnosticsProvider: JavaDiagnosticsTasksProvider | undefined;
  try {
    diagnosticsProvider = new JavaDiagnosticsTasksProvider(logger);
    logger.info("Initializing JavaDiagnosticsProvider");
    const diagnosticsResult = await diagnosticsProvider.init({
      jdtlsBinaryPath: config.jdtlsBinaryPath,
      jdtlsBundles: config.jdtlsBundles,
      jvmMaxMem: config.jvmMaxMem,
      logDir: config.logDir,
      workspacePaths: config.workspacePaths,
    });
    logger.info("DiagnosticsProvider initialized", {
      pipeName: diagnosticsResult.pipeName,
    });
    pipeName = diagnosticsResult.pipeName;
  } catch (error) {
    logger.error("Error initializing JavaDiagnosticsProvider", { error });
    if (diagnosticsProvider) {
      await diagnosticsProvider.stop();
    }
    throw error;
  }

  if (!pipeName) {
    throw new Error("JavaDiagnosticsProvider did not return a pipe name");
  }

  logger.info("Processing ignore files for analysis exclusions");
  const excludedPaths = await getExcludedPaths(logger, config.workspacePaths);

  let analysisProvider: AnalysisTasksProvider | undefined;
  try {
    analysisProvider = new AnalysisTasksProvider(logger);
    logger.info("Initializing AnalysisProvider");

    await analysisProvider.init({
      workspacePaths: config.workspacePaths,
      analyzerBinaryPath: config.kaiAnalyzerRpcPath,
      rulesPaths: config.rulesPaths,
      targets: config.targets,
      sources: config.sources,
      pipePath: pipeName,
      excludedPaths,
      logDir: config.logDir || "",
    });
    logger.info("AnalysisProvider initialized");
  } catch (error) {
    logger.error("Error initializing AnalysisProvider", { error });
    if (analysisProvider) {
      await analysisProvider.stop();
    }
    if (diagnosticsProvider) {
      await diagnosticsProvider.stop();
    }
    throw error;
  }

  return {
    providers: [diagnosticsProvider, analysisProvider],
    shutdownFunc: async () => {
      if (analysisProvider) {
        await analysisProvider.stop();
      }
      if (diagnosticsProvider) {
        await diagnosticsProvider.stop();
      }
    },
  };
}
