import { Logger } from "winston";

import {
  AnalysisTasksProvider,
  AnalyzerInitParams,
  JavaDiagnosticsTasksProvider,
  JavaDiagnosticsInitParams,
  JavaDiagnosticsInitResult,
  TaskProvider,
} from "./taskProviders";
import { FileWatchCapable, SharedFileWatcher } from "./utils/fsWatch";
import { getExcludedPaths } from "./utils/paths";

export interface TaskProviderSetupConfig {
  workspacePaths: string[];
  logger: Logger;
  diagnosticsParams?: Omit<JavaDiagnosticsInitParams, "workspacePaths">;
  analysisParams?: Omit<AnalyzerInitParams, "pipePath" | "excludedPaths" | "workspacePaths">;
}

export interface TaskProviderSetupResult {
  providers: TaskProvider[];
  shutdown: () => Promise<void>;
}

export async function setupProviders(
  config: TaskProviderSetupConfig,
): Promise<TaskProviderSetupResult> {
  if (!config.workspacePaths || config.workspacePaths.length === 0) {
    throw new Error("basePaths must be provided and non-empty");
  }

  const fileWatcher = SharedFileWatcher.getInstance(config.logger, config.workspacePaths);
  const providers: TaskProvider[] = [];
  const providerMap = new Map<string, TaskProvider>();

  config.logger.info("Setting up task management");

  try {
    let diagResult: JavaDiagnosticsInitResult | undefined;

    if (config.diagnosticsParams) {
      config.logger.info("Initializing DiagnosticsProvider");

      const diagProvider = new JavaDiagnosticsTasksProvider(config.logger);
      diagResult = await diagProvider.init({
        ...config.diagnosticsParams,
        workspacePaths: config.workspacePaths,
      });

      providers.push(diagProvider);
      providerMap.set("diagnostics", diagProvider);

      if (
        "onFileChange" in diagProvider &&
        typeof diagProvider.onFileChange === "function"
      ) {
        fileWatcher.registerProvider(diagProvider as FileWatchCapable);
      }

      config.logger.info("DiagnosticsProvider initialized", {
        pipeName: diagResult.pipeName
      });
    }

    if (config.analysisParams) {
      if (!diagResult?.pipeName) {
        throw new Error(
          "AnalysisProvider requires DiagnosticsProvider to be configured and initialized first",
        );
      }

      config.logger.info("Processing ignore files for analysis exclusions");
      const excludedPaths = await getExcludedPaths(config.logger, config.workspacePaths);

      config.logger.info("Initializing AnalysisProvider");

      const analysisProvider = new AnalysisTasksProvider(config.logger);
      await analysisProvider.init({
        ...config.analysisParams,
        workspacePaths: config.workspacePaths,
        pipePath: diagResult.pipeName,
        excludedPaths,
      });

      providers.push(analysisProvider);
      providerMap.set("analysis", analysisProvider);

      // Register with file watcher if it supports file watching
      if (
        "onFileChange" in analysisProvider &&
        typeof analysisProvider.onFileChange === "function"
      ) {
        fileWatcher.registerProvider(analysisProvider as FileWatchCapable);
      }

      config.logger.info("AnalysisProvider initialized");
    }

    config.logger.info("Starting file watcher", {
      paths: config.workspacePaths
    });
    await fileWatcher.start();

    const shutdown = async (): Promise<void> => {
      config.logger.info("Shutting down task management");

      try {
        await fileWatcher.stop();
        config.logger.info("File watcher stopped");

        const reversedProviders = [...providers].reverse();
        await Promise.all(
          reversedProviders.map(async (provider, index) => {
            try {
              await provider.stop();
              config.logger.info("Provider stopped", {
                providerIndex: reversedProviders.length - index
              });
            } catch (error) {
              config.logger.error("Error stopping provider", { error });
            }
          }),
        );

        config.logger.info("All providers stopped");
      } catch (error) {
        config.logger.error("Error during shutdown", { error });
        throw error;
      }
    };

    config.logger.info("Task management setup complete", {
      providerCount: providers.length
    });

    return {
      providers,
      shutdown,
    };
  } catch (error) {
    // Cleanup on error
    config.logger.error("Error during setup, cleaning up", { error });

    try {
      await fileWatcher.stop();
      await Promise.all(providers.map((p) => p.stop()));
    } catch (cleanupError) {
      config.logger.error("Error during cleanup", { cleanupError });
    }
    throw error;
  }
}
