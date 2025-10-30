import { promises as fs } from "fs";
import * as path from "path";
import { execSync } from "child_process";

import { Logger } from "winston";

import { setupKaiEval, KaiEvalSetupResult } from "../src/setup";
import { createOrderedLogger } from "../src/utils/logger";
import { getConfig } from "../src/utils/config";
import {
  type TestCase,
  type TestApplication,
  type EvaluationRunOptions,
} from "../src/eval/types";

describe("Evaluation Runner Integration Tests", () => {
  let logger: Logger;
  let coolstoreProjectPath: string;
  let testDataPath: string;
  let evalSetup: KaiEvalSetupResult;

  beforeEach(async () => {
    let setupError: Error | null = null;

    try {
      const { config, env } = await getConfig({
        workingDir: path.resolve(__dirname, ".."),
      });
      testDataPath = path.resolve(__dirname, "test-data");

      const logDir = path.join(
        testDataPath,
        "logs",
        `eval-runner-test-${new Date()
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d+Z$/, "Z")}`,
      );

      logger = createOrderedLogger(
        config.logLevel?.console || "error",
        config.logLevel?.file || "silly",
        path.join(logDir, "eval-runner-test.log"),
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

      if (!config.models || config.models.length === 0) {
        throw new Error("Models not configured in .config.json");
      }

      // Ensure we have a model configured for evaluation
      const hasEvaluationModel = config.models.some(
        (model) => model.useForEvaluation,
      );
      if (!hasEvaluationModel) {
        throw new Error(
          "No model configured for evaluation. Set useForEvaluation: true on one of the models in .config.json",
        );
      }

      const artifactsPath = path.join(logDir, "eval-artifacts");

      evalSetup = await setupKaiEval({
        config: {
          ...config,
          workspacePaths: [coolstoreProjectPath],
          targets: ["quarkus", "jakarta-ee", "cloud-readiness"],
          sources: [],
          logLevel: config.logLevel || { console: "info", file: "debug" },
          logDir,
        },
        storeSnapshots: true,
        artifactsPath,
      });

      logger.info("Evaluation runner setup completed");
    } catch (error) {
      setupError = error as Error;
      logger?.error("Setup failed, attempting cleanup", { error });
      await shutdown(logger, evalSetup, coolstoreProjectPath);
      throw setupError;
    }
  }, 180000); // 3 minutes timeout for setup

  afterEach(async () => {
    await shutdown(logger, evalSetup, coolstoreProjectPath);
  });

  it("should successfully setup evaluation runner and run mock test cases", async () => {
    // Verify evaluation runner setup
    expect(evalSetup).toBeDefined();
    expect(evalSetup.evaluationRunner).toBeDefined();

    logger.info("Creating mock test cases for evaluation");

    // Create mock test application
    const mockApplication: TestApplication = {
      path: "/test/coolstore-app.yaml",
      name: "coolstore",
      sourceCode: {
        type: "git",
        url: "https://github.com/konveyor-ecosystem/coolstore.git",
        branch: "main",
      },
      programmingLanguage: "Java",
      architecture: await fs.readFile(
        path.join(testDataPath, "evalData", "coolstore", "architecture.md"),
        "utf-8",
      ),
      sources: [],
      targets: ["quarkus", "jakarta-ee", "cloud-readiness"],
    };

    // Create mock test cases
    const mockTestCases: TestCase[] = [
      {
        path: "/test/jms-to-smallrye.yaml",
        name: "jms-to-smallrye-migration",
        description: "Migrate from JMS to SmallRye Reactive Messaging",
        rules: [
          {
            ruleset: "quarkus/springboot",
            rule: "jms-to-reactive-quarkus-00050",
          },
        ],
        migrationHint: "Java EE to Quarkus",
        testSelectors: [],
        application: mockApplication,
        notes: await fs.readFile(
          path.join(
            testDataPath,
            "evalData",
            "coolstore",
            "test_cases",
            "jms-to-smallrye",
            "notes.md",
          ),
          "utf-8",
        ),
      },
    ];

    logger.info("Running evaluation with mock test cases", {
      testCaseCount: mockTestCases.length,
      applicationName: mockApplication.name,
    });

    // Run the evaluation
    const results = await evalSetup.evaluationRunner.run(mockTestCases, {
      variants: [
        {
          name: "basic",
          agentMode: false,
        },
      ],
    });

    // Verify results structure
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(mockTestCases.length);

    const testCaseResult = results[0];
    expect(testCaseResult).toBeDefined();
    expect(testCaseResult.testCase).toBeDefined();
    expect(testCaseResult.testCase.name).toBe("jms-to-smallrye-migration");
    expect(Array.isArray(testCaseResult.results)).toBe(true);
    expect(Array.isArray(testCaseResult.errors)).toBe(true);

    logger.info("Verifying experiment results", {
      experimentCount: testCaseResult.results.length,
      errorCount: testCaseResult.errors.length,
    });

    // Verify that we have results for different variants (basic and agent)
    expect(testCaseResult.results.length).toBeGreaterThan(0);

    testCaseResult.results.forEach((experimentResult) => {
      expect(experimentResult).toBeDefined();
      expect(experimentResult.name).toBeDefined();
      expect(typeof experimentResult.name).toBe("string");

      // Verify metric structure
      expect(experimentResult.completeness).toBeDefined();
      expect(experimentResult.completeness.score).toBeGreaterThanOrEqual(0);
      expect(experimentResult.completeness.score).toBeLessThanOrEqual(1);
      expect(typeof experimentResult.completeness.reasoning).toBe("string");

      expect(experimentResult.functionalParity).toBeDefined();
      expect(experimentResult.functionalParity.score).toBeGreaterThanOrEqual(0);
      expect(experimentResult.functionalParity.score).toBeLessThanOrEqual(1);
      expect(typeof experimentResult.functionalParity.reasoning).toBe("string");

      expect(experimentResult.residualEffort).toBeDefined();
      expect(experimentResult.residualEffort.score).toBeGreaterThanOrEqual(0);
      expect(experimentResult.residualEffort.score).toBeLessThanOrEqual(1);
      expect(typeof experimentResult.residualEffort.reasoning).toBe("string");

      expect(typeof experimentResult.diff).toBe("string");

      logger.info(`Experiment result for variant: ${experimentResult.name}`, {
        completenessScore: experimentResult.completeness.score,
        functionalParityScore: experimentResult.functionalParity.score,
        residualEffortScore: experimentResult.residualEffort.score,
        diffLength: experimentResult.diff.length,
      });
    });

    logger.info("Evaluation runner test completed successfully", {
      totalTestCases: results.length,
      totalExperiments: results.reduce((sum, r) => sum + r.results.length, 0),
      totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
    });
  }, 1200000); // 20 minutes timeout for test execution
});

async function shutdown(
  logger: Logger,
  evalSetup: KaiEvalSetupResult,
  coolstoreProjectPath: string,
): Promise<void> {
  // Note: The evaluation runner handles its own cleanup internally
  // Each test case execution manages its own KaiRunner lifecycle

  if (process.env.TEST_NO_CLEANUP !== "true") {
    try {
      await fs.rm(coolstoreProjectPath, { recursive: true, force: true });
      logger?.info("Cleanup completed - removed coolstore directory");
    } catch (error) {
      logger?.warn("Failed to clean up coolstore directory", { error });
    }
  }
}
