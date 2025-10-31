#!/usr/bin/env node

import { promises as fs } from "fs";
import * as path from "path";

import { program } from "commander";

import { parseTestCasesFromDirectory } from "./eval";
import type { TestCase } from "./eval/types";
import { setupKaiRunner } from "./setup";
import { setupKaiEval } from "./setup/kaiEval";
import type { KaiRunnerConfig } from "./types";
import { loadConfig, loadEnv } from "./utils/config";
import { generateHtmlReport } from "./utils/htmlReportGenerator";

async function kaiRunnerCommand(options: {
  config: string;
  logLevel: {
    console: string;
    file: string;
  };
  logDir: string;
  workspacePaths: string;
  jdtlsBinaryPath: string;
  jdtlsBundles: string;
  jvmMaxMem: string;
  kaiAnalyzerRpcPath: string;
  rulesPaths: string;
  targets: string;
  sources: string;
  solutionServerUrl: string;
}): Promise<void> {
  try {
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
      jdtlsBinaryPath: options.jdtlsBinaryPath,
      jdtlsBundles: options.jdtlsBundles?.split(","),
      jvmMaxMem: options.jvmMaxMem,
      kaiAnalyzerRpcPath: options.kaiAnalyzerRpcPath,
      rulesPaths: options.rulesPaths?.split(","),
      targets: options.targets?.split(","),
      sources: options.sources?.split(","),
      solutionServerUrl: options.solutionServerUrl,
    };

    const finalConfig = mergeConfig(jsonConfig, cliConfig);

    // Setup Kai runner with merged configuration
    const kaiRunnerSetup = await setupKaiRunner(finalConfig, env);
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

async function kaiEvalCommand(options: {
  config: string;
  artifactsPath: string;
  outputDir: string;
  testSelectors: string;
  testPaths: string;
}): Promise<void> {
  try {
    const jsonConfig = await loadConfig({ configPath: options.config });
    loadEnv();

    const { evaluationRunner } = await setupKaiEval({
      config: jsonConfig,
      artifactsPath: options.artifactsPath || jsonConfig.logDir,
    });

    console.log("Starting Kai evaluation...");

    // Parse test cases from provided paths
    let testCases: TestCase[] = [];
    const testPaths = options.testPaths.split(",").map((path) => path.trim());

    for (const testPath of testPaths) {
      console.log(`Parsing test cases from: ${testPath}`);
      try {
        const parsedTestCases = await parseTestCasesFromDirectory(testPath);
        testCases.push(...parsedTestCases);
        console.log(
          `Found ${parsedTestCases.length} test cases in ${testPath}`,
        );
      } catch (error) {
        console.error(`Error parsing test cases from ${testPath}:`, error);
        process.exit(1);
      }
    }

    if (testCases.length === 0) {
      console.warn("No test cases found to evaluate");
      return;
    }

    // Apply test selectors filter if provided
    if (options.testSelectors) {
      const selectors = options.testSelectors
        .split(",")
        .map((selector) => selector.trim());
      console.log(
        `Filtering test cases with selectors: ${selectors.join(", ")}`,
      );

      const filteredTestCases = testCases.filter((testCase) => {
        return selectors.some((selector) => {
          if (selector.includes("#")) {
            const [appName, testName] = selector.split("#");
            return (
              testCase.application.name === appName &&
              testCase.name === testName
            );
          } else {
            return (
              testCase.application.name === selector ||
              testCase.name === selector
            );
          }
        });
      });

      testCases = filteredTestCases;
      console.log(`Filtered to ${testCases.length} test cases`);
    }

    console.log(`Total test cases to evaluate: ${testCases.length}`);

    // suppress console.log of runner, only keep logger
    const results = await evaluationRunner.run(testCases, {
      variants: [
        {
          name: "basic",
          agentMode: false,
        },
        {
          name: "agent",
          agentMode: true,
        },
      ],
    });

    console.log(
      `Evaluation completed. Processed ${results.length} test cases.`,
    );

    for (const result of results) {
      console.log(`\nTest Case: ${result.testCase.name}`);
      console.log(`  Results: ${result.results.length}`);
      console.log(`  Errors: ${result.errors.length}`);

      for (const experiment of result.results) {
        console.log(`  Variant: ${experiment.name}`);
        console.log(`  Model: ${experiment.model}`);
        console.log(
          `    Completeness: ${experiment.completeness.score.toFixed(3)}`,
        );
        console.log(
          `    Functional Parity: ${experiment.functionalParity.score.toFixed(3)}`,
        );
        console.log(
          `    Residual Effort: ${experiment.residualEffort.score.toFixed(3)}`,
        );
        if (experiment.error) {
          console.log(`    Error: ${experiment.error}`);
        }
      }
    }

    if (options.outputDir) {
      const jsonOutput = {
        timestamp: new Date().toISOString(),
        summary: {
          totalTestCases: results.length,
          totalExperiments: results.reduce(
            (sum, r) => sum + r.results.length,
            0,
          ),
          totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
        },
        results: results.map((result) => ({
          testCase: {
            name: result.testCase.name,
            description: result.testCase.description,
            rules: result.testCase.rules,
            application: {
              name: result.testCase.application.name,
              programmingLanguage:
                result.testCase.application.programmingLanguage,
            },
          },
          experiments: result.results.map((exp) => ({
            variant: exp.name,
            model: exp.model,
            metrics: {
              completeness: {
                score: exp.completeness.score,
                reasoning: exp.completeness.reasoning,
              },
              functionalParity: {
                score: exp.functionalParity.score,
                reasoning: exp.functionalParity.reasoning,
              },
              residualEffort: {
                score: exp.residualEffort.score,
                reasoning: exp.residualEffort.reasoning,
              },
            },
            diff: exp.diff,
            error: exp.error,
          })),
          errors: result.errors.map((err) => err.message),
        })),
      };

      // Create output directory if it doesn't exist
      await fs.mkdir(options.outputDir, { recursive: true });

      // Write JSON results
      const jsonOutputPath = path.join(options.outputDir, "results.json");
      await fs.writeFile(jsonOutputPath, JSON.stringify(jsonOutput, null, 2));
      console.log(`\nJSON results written to: ${jsonOutputPath}`);

      // Generate HTML report
      const htmlOutputPath = path.join(options.outputDir, "results.html");
      await generateHtmlReport(jsonOutput, htmlOutputPath);
      console.log(`HTML report generated: ${htmlOutputPath}`);
    }
  } catch (error) {
    console.error("Error running Kai evaluation:", error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  program
    .name("kai")
    .description("Kai code migration and analysis toolkit")
    .version("0.1.0");

  program
    .command("runner")
    .description("Run Kai code migration and analysis")
    .requiredOption("-c, --config <path>", "Path to JSON configuration file")
    .option("--log-level <level>", "Log level (error|warn|info|debug|silly)")
    .option("--log-dir <path>", "Directory for log files")
    .option("--workspace-paths <paths>", "Comma-separated workspace paths")
    .option("--jdtls-binary-path <path>", "Path to JDTLS binary")
    .option("--jdtls-bundles <bundles>", "Comma-separated JDTLS bundle paths")
    .option("--jvm-max-mem <memory>", "Maximum JVM memory (e.g., 4g, 2048m)")
    .option("--kai-analyzer-rpc-path <path>", "Path to Kai analyzer RPC binary")
    .option("--rules-paths <paths>", "Comma-separated rule file paths")
    .option("--targets <targets>", "Comma-separated target list")
    .option("--sources <sources>", "Comma-separated source list")
    .option("--solution-server-url <url>", "Solution server URL")
    .action(kaiRunnerCommand);

  program
    .command("eval")
    .description("Run Kai evaluation on test cases")
    .requiredOption("-c, --config <path>", "Path to JSON configuration file")
    .requiredOption(
      "-t, --test-paths <paths>",
      "Comma-separated paths to test directories",
    )
    .option("--artifacts-path <path>", "Directory for evaluation artifacts")
    .option(
      "--test-selectors <selectors>",
      "Comma-separated test selectors in format <app_name>#<test_name>,...",
    )
    .option(
      "--output-dir <path>",
      "Output directory for results (JSON and HTML)",
    )
    .action(kaiEvalCommand);

  program.parse();
}

function mergeConfig(
  jsonConfig: KaiRunnerConfig,
  cliOptions: KaiRunnerConfig,
): KaiRunnerConfig {
  return {
    ...jsonConfig,
    ...Object.fromEntries(
      Object.entries(cliOptions).filter(([, value]) => value !== undefined),
    ),
  };
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
