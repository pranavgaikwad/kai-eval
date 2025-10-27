#!/usr/bin/env node

import { program } from "commander";

import { SupportedModelProviders } from "./kai/modelProvider";
import { setupKaiRunner } from "./setup/kaiRunner";
import { KaiRunnerConfig } from "./types";
import { loadConfig, loadEnv } from "./utils/config";


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
      logLevel: {
        ...options.logLevel,
        console: options.logLevel?.console || "info",
        file: options.logLevel?.file || "debug",
      },
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

    // TODO (pgaikwad): pass the right incidents
    // Setup Kai runner with merged configuration
    const kaiRunnerSetup = await setupKaiRunner(finalConfig, {
      incidents: [],
      programmingLanguage: "Java",
      migrationHint: "",
      enableAgentMode: false,
    }, env);
    const { logger, shutdown: kaiShutdown } = kaiRunnerSetup;

    // Setup graceful shutdown
    const shutdown = async () => {
      try {
        await kaiShutdown();
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