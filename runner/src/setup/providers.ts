import os from "os";
import path from "path";


import {
  AnalysisTasksProvider,
  JavaDiagnosticsTasksProvider,
  type JavaDiagnosticsInitResult,
  type TaskProvider,
} from "../taskProviders";
import {
  type TaskProviderSetupConfig,
  type TaskProviderSetupResult,
} from "./types";
import { type FileWatchCapable, SharedFileWatcher } from "../utils/fsWatch";
import { createOrderedLogger } from "../utils/logger";
import { getExcludedPaths } from "../utils/paths";

export async function setupProviders(
  config: TaskProviderSetupConfig,
): Promise<TaskProviderSetupResult> {
  if (!config.workspacePaths || config.workspacePaths.length === 0) {
    throw new Error("basePaths must be provided and non-empty");
  }
  const logger = config.logger
    ? config.logger.child({ module: "ProvidersSetup" })
    : createOrderedLogger(
        "info",
        "debug",
        path.join(os.tmpdir(), "providers.log"),
      );

  const fileWatcher = SharedFileWatcher.getInstance(
    logger,
    config.workspacePaths,
  );
  const providers: TaskProvider[] = [];
  const providerMap: {
    diagnostics?: JavaDiagnosticsTasksProvider;
    analysis?: AnalysisTasksProvider;
  } = {};

  logger.info("Setting up task management");

  try {
    let diagResult: JavaDiagnosticsInitResult | undefined;

    if (config.diagnosticsParams) {
      logger.info("Initializing DiagnosticsProvider");

      const diagProvider = new JavaDiagnosticsTasksProvider(logger);
      diagResult = await diagProvider.init({
        ...config.diagnosticsParams,
        workspacePaths: config.workspacePaths,
      });

      providers.push(diagProvider);
      providerMap.diagnostics = diagProvider;

      if (
        "onFileChange" in diagProvider &&
        typeof diagProvider.onFileChange === "function"
      ) {
        fileWatcher.registerProvider(diagProvider as FileWatchCapable);
      }

      logger.info("DiagnosticsProvider initialized", {
        pipeName: diagResult.pipeName,
      });
    }

    if (config.analysisParams) {
      if (!diagResult?.pipeName) {
        throw new Error(
          "AnalysisProvider requires DiagnosticsProvider to be configured and initialized first",
        );
      }

      logger.info("Processing ignore files for analysis exclusions");
      const excludedPaths = await getExcludedPaths(
        logger,
        config.workspacePaths,
      );

      logger.info("Initializing AnalysisProvider");

      const analysisProvider = new AnalysisTasksProvider(logger);
      await analysisProvider.init({
        ...config.analysisParams,
        workspacePaths: config.workspacePaths,
        pipePath: diagResult.pipeName,
        excludedPaths,
      });

      providers.push(analysisProvider);
      providerMap.analysis = analysisProvider;

      // Register with file watcher if it supports file watching
      if (
        "onFileChange" in analysisProvider &&
        typeof analysisProvider.onFileChange === "function"
      ) {
        fileWatcher.registerProvider(analysisProvider as FileWatchCapable);
      }

      logger.info("AnalysisProvider initialized");
    }

    logger.info("Starting file watcher", {
      paths: config.workspacePaths,
    });
    await fileWatcher.start();

    const shutdown = async (): Promise<void> => {
      logger.info("Shutting down task management");

      try {
        await fileWatcher.stop();
        logger.info("File watcher stopped");

        const reversedProviders = [...providers].reverse();
        await Promise.all(
          reversedProviders.map(async (provider, index) => {
            try {
              await provider.stop();
              logger.info("Provider stopped", {
                providerIndex: reversedProviders.length - index,
              });
            } catch (error) {
              logger.error("Error stopping provider", { error });
            }
          }),
        );

        logger.info("All providers stopped");
      } catch (error) {
        logger.error("Error during shutdown", { error });
        throw error;
      }
    };

    logger.info("Task management setup complete", {
      providerCount: providers.length,
    });

    return {
      providers: providerMap,
      shutdown,
    };
  } catch (error) {
    // Cleanup on error
    logger.error("Error during setup, cleaning up", { error });

    try {
      await fileWatcher.stop();
      await Promise.all(providers.map((p) => p.stop()));
    } catch (cleanupError) {
      logger.error("Error during cleanup", { cleanupError });
    }
    throw error;
  }
}
