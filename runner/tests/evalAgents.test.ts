import { promises as fs } from "fs";
import * as path from "path";
import { execSync } from "child_process";

import { Logger } from "winston";

import { setupKaiRunner, KaiRunnerSetupResult } from "../src/setup";
import { createOrderedLogger } from "../src/utils/logger";
import { getConfig } from "../src/utils/config";
import { runEvaluation } from "../src/eval/agents";
import { EvaluationTools } from "../src/eval/tools";
import {
  EvaluationToolOptions,
  TestCase,
  TestApplication,
} from "../src/eval/types";
import { createModel } from "../src/kai/modelProvider";
import { getAllFiles, getChangedFiles } from "../src/utils/paths";
import { AnalysisTask, DiagnosticTask } from "../src/taskProviders/tasks";

describe("Evaluation Agents Tests", () => {
  let logger: Logger;
  let coolstoreProjectPath: string;
  let testDataPath: string;
  let kaiRunnerSetup: KaiRunnerSetupResult;
  let diffPath: string;

  beforeEach(async () => {
    let setupError: Error | null = null;

    try {
      const { config, env } = await getConfig({
        workingDir: path.resolve(__dirname, ".."),
      });
      testDataPath = path.resolve(__dirname, "test-data");
      diffPath = path.join(
        testDataPath,
        "diffs",
        "coolstore.jms-to-smallrye.diff",
      );

      const logDir = path.join(
        testDataPath,
        "logs",
        `agents-test-${new Date()
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d+Z$/, "Z")}`,
      );

      logger = createOrderedLogger(
        config.logLevel?.console || "error",
        config.logLevel?.file || "silly",
        path.join(logDir, "agents-test.log"),
      );

      coolstoreProjectPath = path.join(
        testDataPath,
        "coolstore-eval-agents-test",
      );

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

      // Check if we have a model for evaluation
      const hasEvaluationModel = config.models.some(
        (model) => model.useForEvaluation,
      );
      if (!hasEvaluationModel) {
        throw new Error(
          "No model configured for evaluation. Set useForEvaluation: true on one of the models in .config.json",
        );
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
        true,
      );

      logger.info("KaiRunner setup completed");
    } catch (error) {
      setupError = error as Error;
      logger?.error("Setup failed, attempting cleanup", { error });
      await shutdown(logger, kaiRunnerSetup, coolstoreProjectPath);
      throw setupError;
    }
  }, 180000); // 3 minutes timeout for setup

  afterEach(async () => {
    await shutdown(logger, kaiRunnerSetup, coolstoreProjectPath);
  });

  it("should run evaluation agents with mock migration diff", async () => {
    expect(kaiRunnerSetup).toBeDefined();
    expect(kaiRunnerSetup.taskManager).toBeDefined();

    try {
      await fs.access(diffPath);
    } catch (error) {
      throw new Error(
        `Mock diff file not found at ${diffPath}. Please ensure the diff file exists.`,
      );
    }

    logger.info("Starting agents evaluation test");

    const snapshotIdBefore = await kaiRunnerSetup.taskManager.getTasks();
    const diffBefore =
      kaiRunnerSetup.taskManager.getTasksDiff(snapshotIdBefore);
    const tasksBefore = [...diffBefore.added, ...diffBefore.unresolved];

    const analysisTasksBefore = tasksBefore.filter(
      (task) => task instanceof AnalysisTask,
    );

    const diagnosticsTasksBefore = tasksBefore.filter(
      (task) => task instanceof DiagnosticTask,
    );

    logger.info("Initial tasks collected", {
      totalTasks: tasksBefore.length,
      analysisTasks: analysisTasksBefore.length,
      diagnosticsTasks: diagnosticsTasksBefore.length,
    });

    const fileListBefore = await getAllFiles(logger, coolstoreProjectPath);

    logger.info("Applying mock diff to simulate migration");
    try {
      execSync(`git apply ${diffPath}`, {
        cwd: coolstoreProjectPath,
        stdio: "pipe",
      });
    } catch (error) {
      throw new Error(`Failed to apply mock diff: ${error}`);
    }

    const changedFilePaths = await getChangedFiles(
      logger,
      coolstoreProjectPath,
    );
    const changedFiles = new Map<string, string>();

    for (const filePath of changedFilePaths) {
      try {
        const fullPath = path.resolve(coolstoreProjectPath, filePath);
        const content = await fs.readFile(fullPath, "utf-8");
        changedFiles.set(filePath, content);
      } catch (error) {
        logger.warn(`Failed to read changed file ${filePath}`, { error });
      }
    }

    const fileListAfter = await getAllFiles(logger, coolstoreProjectPath);

    const snapshotIdAfter = await kaiRunnerSetup.taskManager.getTasks();
    const diffAfter = kaiRunnerSetup.taskManager.getTasksDiff(snapshotIdAfter);
    const tasksAfter = [...diffAfter.added, ...diffAfter.unresolved];

    const analysisTasksAfter = tasksAfter.filter(
      (task) => task instanceof AnalysisTask,
    );

    const diagnosticsTasksAfter = tasksAfter.filter(
      (task) => task instanceof DiagnosticTask,
    );

    logger.info("Post-migration tasks collected", {
      totalTasks: tasksAfter.length,
      analysisTasks: analysisTasksAfter.length,
      diagnosticsTasks: diagnosticsTasksAfter.length,
      changedFiles: changedFiles.size,
    });

    try {
      execSync("git reset --hard", { cwd: coolstoreProjectPath });
    } catch (error) {
      logger.warn("Failed to reset workspace", { error });
    }

    const mockApplication: TestApplication = {
      path: "/test/app.yaml",
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
      sources: [""],
      targets: ["quarkus", "jakarta-ee", "cloud-readiness"],
    };

    const mockTestCase: TestCase = {
      path: "/test/tc.yaml",
      name: "jms-to-smallrye",
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
    };

    const evaluationOptions: EvaluationToolOptions = {
      analysisIssues: {
        before: analysisTasksBefore,
        after: analysisTasksAfter,
      },
      diagnosticsIssues: {
        before: diagnosticsTasksBefore,
        after: diagnosticsTasksAfter,
      },
      fileList: {
        before: fileListBefore,
        after: fileListAfter,
      },
      changedFiles,
      appArchitecture: mockApplication.architecture,
      originalRules: mockTestCase.rules,
    };

    const evaluationTools = new EvaluationTools(
      evaluationOptions,
      coolstoreProjectPath,
      logger,
    );

    const { config } = await getConfig({
      workingDir: path.resolve(__dirname, ".."),
    });

    const evaluationModelConfig = config.models!.find(
      (model) => model.useForEvaluation,
    );
    const evaluationModel = await createModel(
      evaluationModelConfig!.provider,
      evaluationModelConfig!.args,
      process.env as Record<string, string>,
      logger,
    );

    const agentResults = await runEvaluation({
      testCase: mockTestCase,
      evaluationTools,
      issues:
        "JMS is not supported in Quarkus. References to JavaEE/JakartaEE JMS elements should be removed and replaced with their Quarkus SmallRye/Microprofile equivalents.",
      model: evaluationModel,
      logger,
    });

    expect(agentResults).toBeDefined();
    expect(agentResults.completeness).toBeDefined();
    expect(agentResults.functionalParity).toBeDefined();
    expect(agentResults.residualEffort).toBeDefined();

    expect(agentResults.completeness.metric).toBeDefined();
    expect(agentResults.completeness.metric.score).toBeGreaterThanOrEqual(0);
    expect(agentResults.completeness.metric.score).toBeLessThanOrEqual(1);
    expect(agentResults.completeness.metric.reasoning).toBeTruthy();

    expect(agentResults.functionalParity.metric).toBeDefined();
    expect(agentResults.functionalParity.metric.score).toBeGreaterThanOrEqual(
      0,
    );
    expect(agentResults.functionalParity.metric.score).toBeLessThanOrEqual(1);
    expect(agentResults.functionalParity.metric.reasoning).toBeTruthy();

    expect(agentResults.residualEffort.metric).toBeDefined();
    expect(agentResults.residualEffort.metric.score).toBeGreaterThanOrEqual(0);
    expect(agentResults.residualEffort.metric.score).toBeLessThanOrEqual(1);
    expect(agentResults.residualEffort.metric.reasoning).toBeTruthy();

    logger.info("Agents evaluation test completed successfully", {
      completenessScore: agentResults.completeness.metric.score,
      functionalParityScore: agentResults.functionalParity.metric.score,
      residualEffortScore: agentResults.residualEffort.metric.score,
    });
  }, 600000); // 10 minutes timeout for agents evaluation
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

  if (process.env.TEST_NO_CLEANUP !== "true") {
    try {
      await fs.rm(coolstoreProjectPath, { recursive: true, force: true });
    } catch (error) {
      logger?.warn("Failed to clean up coolstore directory", { error });
    }
  }
}
