#!/usr/bin/env node

import * as os from "os";
import * as path from "path";

import { program } from "commander";
import { createLogger, transports } from "winston";

import { SupportedModelProviders } from "./kai/modelProvider";
import { setupKai, KaiSetupConfig } from "./setupKai";
import { setupProviders, TaskProviderSetupConfig } from "./setupProviders";
import { TaskManager } from "./taskManager/taskManager";
import { KaiRunnerConfig } from "./types";
import { loadConfig, loadEnv } from "./utils/config";
import { orderedJsonFormat } from "./utils/logger";


async function main(): Promise<void> {
  program
    .name("kai-runner")
    .description("Kai code migration and analysis runner")
    .version("0.1.0")
    .requiredOption("-c, --config <path>", "Path to JSON configuration file")
    .option("--log-level <level>", "Log level (error|warn|info|debug|silly)")
    .option("--log-dir <path>", "Directory for log files")
    .option("--workspace-paths <paths>", "Comma-separated workspace paths")
    .option("--model-provider <provider>", "Model provider to use")
    .option("--jdtls-binary-path <path>", "Path to JDTLS binary")
    .option("--jdtls-bundles <bundles>", "Comma-separated JDTLS bundle paths")
    .option("--jvm-max-mem <memory>", "Maximum JVM memory (e.g., 4g, 2048m)")
    .option("--kai-analyzer-rpc-path <path>", "Path to Kai analyzer RPC binary")
    .option("--rules-path <paths>", "Comma-separated rule file paths")
    .option("--targets <targets>", "Comma-separated target list")
    .option("--sources <sources>", "Comma-separated source list")
    .option("--solution-server-url <url>", "Solution server URL")

  program.parse();

  const options = program.opts();

  try {
    // Load configuration and environment
    const jsonConfig = await loadConfig({ configPath: options.config });
    const env = loadEnv();

    const cliConfig: KaiRunnerConfig = {
      logLevel: options.logLevel,
      logDir: options.logDir,
      workspacePaths: options.workspacePaths?.split(","),
      modelProvider: options.modelProvider as SupportedModelProviders,
      jdtlsBinaryPath: options.jdtlsBinaryPath,
      jdtlsBundles: options.jdtlsBundles?.split(","),
      jvmMaxMem: options.jvmMaxMem,
      kaiAnalyzerRpcPath: options.kaiAnalyzerRpcPath,
      rulesPaths: options.rulesPath?.split(","),
      targets: options.targets?.split(","),
      sources: options.sources?.split(","),
      solutionServerUrl: options.solutionServerUrl,
    };

    const finalConfig = mergeConfig(jsonConfig, cliConfig);

    if (!finalConfig.workspacePaths || finalConfig.workspacePaths.length === 0) {
      throw new Error("workspacePaths must be provided either in config file or via --workspace-paths");
    }

    // TODO (pgaikwad): re-visit when adding multi-workspace support
    const workspaceDir = finalConfig.workspacePaths[0];

    const logDir = finalConfig.logDir || path.join(os.tmpdir(), `kai-runner-logs-${Date.now()}`);

    const logger = createLogger({
      level: finalConfig.logLevel || "info",
      format: orderedJsonFormat,
      transports: [
        new transports.File({
          filename: path.join(logDir, "kai-runner.log"),
        }),
        new transports.Console(),
      ],
    });

    logger.info("Starting Kai runner", { config: finalConfig });
    logger.info("Setting up task providers");
    const providerConfig: TaskProviderSetupConfig = {
      workspacePaths: finalConfig.workspacePaths,
      logger,
      ...(finalConfig.jdtlsBinaryPath && {
        diagnosticsParams: {
          jdtlsBinaryPath: finalConfig.jdtlsBinaryPath,
          jdtlsBundles: finalConfig.jdtlsBundles || [],
          jvmMaxMem: finalConfig.jvmMaxMem,
          logDir,
        },
      }),
      ...(finalConfig.kaiAnalyzerRpcPath && {
        analysisParams: {
          analyzerBinaryPath: finalConfig.kaiAnalyzerRpcPath,
          rulesPaths: finalConfig.rulesPaths || [],
          targets: finalConfig.targets || [],
          sources: finalConfig.sources || [],
          logDir,
        },
      }),
    };

    const providersSetup = await setupProviders(providerConfig);

    if (!providersSetup.providers.analysis || !providersSetup.providers.diagnostics) {
      throw new Error("Failed to initialize providers");
    }

    // Step 2: Setup task manager
    logger.info("Setting up task manager");
    const taskManager = new TaskManager(logger, [
      providersSetup.providers.analysis,
      providersSetup.providers.diagnostics,
    ]);

    // Step 3: Setup Kai workflow manager
    logger.info("Setting up Kai workflow manager");

    if (!finalConfig.modelProvider) {
      throw new Error("modelProvider must be specified in config or via --model-provider");
    }

    const kaiConfig: KaiSetupConfig = {
      workspaceDir,
      logger,
      taskManager,
      modelConfig: {
        provider: finalConfig.modelProvider,
        args: finalConfig.modelArgs || {},
      },
      env,
      solutionServerUrl: finalConfig.solutionServerUrl,
      traceDir: path.join(logDir, "traces"),
    };

    const kaiSetup = await setupKai(kaiConfig);

    logger.info("Kai runner setup complete");

    // Setup graceful shutdown
    const shutdown = async () => {
      logger.info("Shutting down Kai runner");
      try {
        await kaiSetup.shutdown();
        await providersSetup.shutdown();
        logger.info("Kai runner shutdown complete");
        process.exit(0);
      } catch (error) {
        logger.error("Error during shutdown", { error });
        process.exit(1);
      }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep the process alive
    logger.info("Kai runner is ready. Press Ctrl+C to stop.");

  } catch (error) {
    console.error("Error starting Kai runner:", error);
    process.exit(1);
  }
}


function mergeConfig(jsonConfig: KaiRunnerConfig, cliOptions: KaiRunnerConfig): KaiRunnerConfig {
  return {
    ...jsonConfig,
    ...Object.fromEntries(
      Object.entries(cliOptions).filter(([, value]) => value !== undefined)
    ),
  };
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}