import { promises as fs } from "fs";
import * as path from "path";
import { execSync } from "child_process";

import { Logger } from "winston";

import { setupKaiRunner, KaiRunnerSetupResult } from "../src/cli";
import { createOrderedLogger } from "../src/utils/logger";
import { getConfig } from "../src/utils/config";
import { KaiInteractiveWorkflowInput } from "@editor-extensions/agentic";
import { EnhancedIncident } from "@editor-extensions/shared";

describe("KaiRunner Integration Tests", () => {
  let logger: Logger;
  let coolstoreProjectPath: string;
  let testDataPath: string;
  let kaiRunnerSetup: KaiRunnerSetupResult;

  beforeEach(async () => {
    let setupError: Error | null = null;

    try {
      const { config, env } = await getConfig({
        workingDir: path.resolve(__dirname, ".."),
      });
      testDataPath = path.resolve(__dirname, "test-data");

      const logDir = path.join(testDataPath, "logs");

      logger = createOrderedLogger(
        config.logLevel?.console || "error",
        config.logLevel?.file || "silly",
        path.join(logDir, "kai-runner-test.log"),
      );

      coolstoreProjectPath = path.join(testDataPath, "coolstore");

      try {
        await fs.rm(coolstoreProjectPath, { recursive: true, force: true });
      } catch (error) {
        // Directory doesn't exist
      }

      logger.info("Cloning coolstore repository...");
      try {
        execSync(
          `git clone https://github.com/konveyor-ecosystem/coolstore.git ${coolstoreProjectPath}`,
          { stdio: "pipe", timeout: 60000 },
        );
      } catch (error) {
        throw new Error(`Failed to clone coolstore repository: ${error}`);
      }

      const pomPath = path.join(coolstoreProjectPath, "pom.xml");
      await fs.access(pomPath);

      if (!config.jdtlsBinaryPath) {
        throw new Error("JDTLS binary path not configured in .config.json");
      }

      if (!config.kaiAnalyzerRpcPath) {
        throw new Error("Kai analyzer RPC path not configured in .config.json");
      }

      if (!config.modelProvider) {
        throw new Error("Model provider not configured in .config.json");
      }

      kaiRunnerSetup = await setupKaiRunner(
        {
          ...config,
          workspacePaths: [coolstoreProjectPath],
          targets: ["quarkus", "jakarta-ee", "cloud-readiness"],
          sources: [],
          logLevel: config.logLevel || { console: "info", file: "debug" },
          logDir,
        },
        env,
      );

      logger.info("KaiRunner setup completed");
    } catch (error) {
      setupError = error as Error;
      logger?.error("Setup failed, attempting cleanup", { error });
      shutdown(logger, kaiRunnerSetup, coolstoreProjectPath);
      throw setupError;
    }
  }, 180000); // 3 minutes timeout for setup

  afterEach(async () => {
    shutdown(logger, kaiRunnerSetup, coolstoreProjectPath);
  });

  it("should successfully setup KaiRunner with all components initialized", async () => {
    // Verify KaiRunner setup result structure
    expect(kaiRunnerSetup).toBeDefined();
    expect(kaiRunnerSetup.logger).toBeDefined();
    expect(kaiRunnerSetup.providersSetup).toBeDefined();
    expect(kaiRunnerSetup.kaiSetup).toBeDefined();
    expect(kaiRunnerSetup.taskManager).toBeDefined();
    expect(typeof kaiRunnerSetup.shutdown).toBe("function");
    // Verify providers are initialized
    expect(kaiRunnerSetup.providersSetup.providers).toBeDefined();
    expect(kaiRunnerSetup.providersSetup.providers.analysis).toBeDefined();
    expect(kaiRunnerSetup.providersSetup.providers.diagnostics).toBeDefined();
    const analysisProvider = kaiRunnerSetup.providersSetup.providers.analysis;
    const diagnosticsProvider =
      kaiRunnerSetup.providersSetup.providers.diagnostics;
    expect(analysisProvider?.isInitialized()).toBe(true);
    expect(diagnosticsProvider?.isInitialized()).toBe(true);
    logger.info("All providers initialized successfully");

    // run workflow
    await kaiRunnerSetup.runFunc({
      kind: "fixByRules",
      data: {
        agentMode: true,
        migrationHint: "Java EE to Quarkus",
        programmingLanguage: "Java",
        rules: [
          {
            rule: "jms-to-reactive-quarkus-00050",
            ruleset: "quarkus/springboot",
          },
        ],
      },
    });

    logger.info("KaiRunner setup test completed successfully");
  }, 900000); // 15 minutes timeout for test execution
});

async function shutdown(
  logger: Logger,
  kaiRunnerSetup: KaiRunnerSetupResult,
  coolstoreProjectPath: string,
): Promise<void> {
  if (kaiRunnerSetup) {
    try {
      await kaiRunnerSetup.shutdown();
      logger?.info("KaiRunner shutdown completed");
    } catch (error) {
      logger?.error("Error during KaiRunner shutdown", { error });
    }
  }

  // try {
  //   await fs.rm(coolstoreProjectPath, { recursive: true, force: true });
  // } catch (error) {
  //   logger?.warn("Failed to clean up coolstore directory", { error });
  // }
}
