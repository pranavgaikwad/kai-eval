import { exec } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

import { type KaiRunnerConfig } from "../types";
import { type TaskManager } from "../taskManager";
import { type Task } from "../taskProviders";
import { AnalysisTask, DiagnosticTask } from "../taskProviders/tasks";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Logger } from "winston";

import { parseTestCasesFromDirectory } from "./parser";
import {
  type EvaluationRunner,
  type TestCase,
  TestCaseResults,
  ExperimentResults,
  type TestApplication,
  type EvaluationToolOptions,
} from "./types";
import { EvaluationTools } from "./tools";
import { runEvaluation } from "./agents";
import { setupKaiRunner } from "../setup/kaiRunner";
import { type RunKaiWorkflowInput } from "../setup/types";
import { type SupportedModelProviders } from "../kai";
import { createModel } from "../kai/modelProvider";
import { getAllFiles, getChangedFiles } from "../utils/paths";

const execAsync = promisify(exec);

interface TestVariant {
  readonly name: string;
  readonly agentMode: boolean;
  readonly solutionServerUrl?: string;
}

export class DefaultEvaluationRunner implements EvaluationRunner {
  private readonly artifactsPath: string;
  private readonly logger: Logger;
  private readonly variants: TestVariant[] = [
    {
      name: "basic",
      agentMode: false,
    },
    {
      name: "agent",
      agentMode: true,
    },
  ];

  constructor(
    private readonly config: KaiRunnerConfig & {
      logger: Logger;
      artifactsPath?: string;
      testDataPath?: string;
      testCaseFilters?: string[];
    },
  ) {
    this.artifactsPath =
      config.artifactsPath || path.join(os.tmpdir(), "eval-artifacts");
    this.logger = config.logger.child({ module: "DefaultEvaluationRunner" });
  }

  async run(testCases: TestCase[]): Promise<TestCaseResults[]> {
    this.logger.info(
      `Starting evaluation run with ${testCases.length} test cases`,
    );

    if (!this.config.models || this.config.models.length === 0) {
      throw new Error("No models specified in configuration");
    }

    const results: TestCaseResults[] = [];

    for (const testCase of testCases) {
      this.logger.info(`Processing test case: ${testCase.name}`);

      const testCaseResults: TestCaseResults = {
        testCase,
        errors: [],
        results: [],
      };

      try {
        for (const variant of this.variants) {
          this.logger.info(
            `Using variant: ${variant.name} for test case: ${testCase.name}`,
          );
          for (const modelConfig of this.config.models) {
            const modelName = `${modelConfig.provider}`;
            this.logger.info(
              `Using model: ${modelName} for variant: ${variant.name}`,
            );

            try {
              const artifactDir = path.join(
                this.artifactsPath,
                testCase.name,
                variant.name,
                modelName,
              );
              await this.ensureDirectoryExists(artifactDir);

              const sourceDir = path.join(artifactDir, "source");
              const { workspacePath, application } =
                await this.setupTestApplication(testCase, sourceDir);

              // Execute the test case
              const experimentResult = await this.executeTestCase(
                testCase,
                variant,
                modelConfig,
                workspacePath,
                application,
              );
              testCaseResults.results.push(experimentResult);
            } catch (error) {
              this.logger.error(
                `Failed to process model ${modelName} for variant ${variant.name}`,
                { error },
              );
              testCaseResults.errors.push(
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          }
        }
      } catch (error) {
        this.logger.error(`Failed to process test case ${testCase.name}`, {
          error,
        });
        testCaseResults.errors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }

      results.push(testCaseResults);
    }

    this.logger.info(
      `Evaluation run completed. Processed ${results.length} test cases`,
    );
    return results;
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create directory ${dirPath}`, { error });
      throw error;
    }
  }

  private async setupTestApplication(
    testCase: TestCase,
    sourceDir: string,
  ): Promise<{ workspacePath: string; application: TestApplication }> {
    await this.ensureDirectoryExists(sourceDir);

    const application = testCase.application;
    const sourceCode = application.sourceCode;
    let repoPath = sourceDir;

    try {
      await fs.rm(sourceDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.error(`Failed to remove directory ${sourceDir}`, { error });
    }

    if (sourceCode.type === "git") {
      this.logger.info(
        `Cloning git repository ${sourceCode.url} (branch: ${sourceCode.branch})`,
      );
      try {
        await execAsync(
          `git clone --branch ${sourceCode.branch} ${sourceCode.url} ${sourceDir}`,
        );

        if (sourceCode.path) {
          repoPath = path.join(sourceDir, sourceCode.path);
        }
      } catch (error) {
        this.logger.error(`Failed to clone repository ${sourceCode.url}`, {
          error,
        });
        throw error;
      }
    } else if (sourceCode.type === "local") {
      this.logger.info(`Copying local files from ${sourceCode.path}`);
      try {
        await execAsync(`cp -r ${sourceCode.path}/* ${sourceDir}/`);
      } catch (error) {
        this.logger.error(
          `Failed to copy local files from ${sourceCode.path}`,
          { error },
        );
        throw error;
      }
    }

    return { workspacePath: repoPath, application };
  }

  private createTestConfig(
    modelConfig: {
      provider: SupportedModelProviders;
      args: Record<string, unknown>;
    },
    workspacePath: string,
    application: TestApplication,
  ): KaiRunnerConfig {
    const baseConfig = { ...this.config };
    baseConfig.workspacePaths = [workspacePath];
    baseConfig.models = [modelConfig];
    if (application.sources) {
      baseConfig.sources = application.sources;
    }
    if (application.targets) {
      baseConfig.targets = application.targets;
    }
    return baseConfig;
  }

  private async executeTestCase(
    testCase: TestCase,
    variant: TestVariant,
    modelConfig: {
      provider: SupportedModelProviders;
      args: Record<string, unknown>;
    },
    workspacePath: string,
    application: TestApplication,
  ): Promise<ExperimentResults> {
    this.logger.info(
      `Executing test case ${testCase.name} with variant ${variant.name}`,
    );

    try {
      const testConfig = this.createTestConfig(
        modelConfig,
        workspacePath,
        application,
      );

      const {
        runFunc: runKaiWorkflow,
        taskManager,
        shutdown: kaiShutdown,
      } = await setupKaiRunner(
        testConfig,
        process.env as Record<string, string>,
        false,
      );

      try {
        this.logger.debug("Collecting pre-migration data");
        const fileListBefore = await getAllFiles(this.logger, workspacePath);
        const tasksBefore = await this.getAllTasks(taskManager);

        const workflowInput: RunKaiWorkflowInput = {
          kind: "fixByRules",
          data: {
            rules: testCase.rules,
            migrationHint: testCase.migrationHint,
            programmingLanguage: application.programmingLanguage,
            agentMode: variant.agentMode,
          },
        };
        this.logger.debug("Running Kai workflow");
        await runKaiWorkflow(workflowInput);

        this.logger.debug("Collecting post-migration data");
        const fileListAfter = await getAllFiles(this.logger, workspacePath);
        const changedFilePaths = await getChangedFiles(
          this.logger,
          workspacePath,
        );
        const changedFiles = await this.getChangedFilesContent(
          workspacePath,
          changedFilePaths,
        );
        const tasksAfter = await this.getAllTasks(taskManager);
        this.logger.debug("Resetting workspace to pre-migration state");
        try {
          await execAsync("git reset --hard", { cwd: workspacePath });
        } catch (error) {
          this.logger.warn(
            "Failed to reset workspace (no git repo or other issue)",
            { error },
          );
        }

        const evaluationOptions: EvaluationToolOptions = {
          analysisIssues: {
            before: tasksBefore.analysisTasks,
            after: tasksAfter.analysisTasks,
          },
          diagnosticsIssues: {
            before: tasksBefore.diagnosticsTasks,
            after: tasksAfter.diagnosticsTasks,
          },
          fileList: {
            before: fileListBefore,
            after: fileListAfter,
          },
          changedFiles,
          appArchitecture: application.architecture,
          originalRules: testCase.rules,
        };

        const evaluationTools = new EvaluationTools(
          evaluationOptions,
          workspacePath,
          this.logger,
        );

        // Get matching issues from before tasks
        const issues = this.getMatchingIssues(
          testCase,
          tasksBefore.analysisTasks,
        );

        // Create evaluation model
        const evaluationModel = await this.getEvaluationModel();

        this.logger.info("Evaluation tools prepared", {
          analysisBefore: tasksBefore.analysisTasks.length,
          analysisAfter: tasksAfter.analysisTasks.length,
          diagnosticsBefore: tasksBefore.diagnosticsTasks.length,
          diagnosticsAfter: tasksAfter.diagnosticsTasks.length,
          filesBefore: fileListBefore.length,
          filesAfter: fileListAfter.length,
          changedFiles: changedFiles.size,
          issuesMatched: issues.split("\n").filter((line) => line.trim())
            .length,
        });

        // Run evaluation agents
        const agentResults = await runEvaluation({
          testCase,
          evaluationTools,
          issues,
          model: evaluationModel,
          logger: this.logger,
        });

        return {
          name: variant.name,
          completeness: agentResults.completeness.metric,
          functionalParity: agentResults.functionalParity.metric,
          residualEffort: agentResults.residualEffort.metric,
          diff: changedFilePaths.join("\n"),
        };
      } finally {
        // Always cleanup the KaiRunner
        await kaiShutdown();
      }
    } catch (error) {
      this.logger.error(`Failed to execute test case ${testCase.name}`, {
        error,
      });
      throw error;
    }
  }

  private async getAllTasks(taskManager: TaskManager): Promise<{
    analysisTasks: AnalysisTask[];
    diagnosticsTasks: DiagnosticTask[];
  }> {
    try {
      const snapshotId = await taskManager.getTasks();
      const diff = taskManager.getTasksDiff(snapshotId);

      const allTasks = [...diff.added, ...diff.unresolved];

      // Separate tasks based on their provider name
      const analysisTasks = allTasks.filter(
        (task) => task instanceof AnalysisTask,
      );

      const diagnosticsTasks = allTasks.filter(
        (task) => task instanceof DiagnosticTask,
      );

      this.logger.debug("Separated tasks", {
        totalTasks: allTasks.length,
        analysisTasks: analysisTasks.length,
        diagnosticsTasks: diagnosticsTasks.length,
      });

      return { analysisTasks, diagnosticsTasks };
    } catch (error) {
      this.logger.error("Error separating tasks", { error });
      return { analysisTasks: [], diagnosticsTasks: [] };
    }
  }

  private async getChangedFilesContent(
    workspacePath: string,
    changedFilePaths: string[],
  ): Promise<Map<string, string>> {
    const changedFiles = new Map<string, string>();

    for (const filePath of changedFilePaths) {
      try {
        const fullPath = path.resolve(workspacePath, filePath);
        const content = await fs.readFile(fullPath, "utf-8");
        changedFiles.set(filePath, content);
      } catch (error) {
        this.logger.warn(`Failed to read changed file ${filePath}`, { error });
      }
    }

    return changedFiles;
  }

  /**
   * Filters and formats tasks that match the test case rules
   */
  private getMatchingIssues(testCase: TestCase, tasks: Task[]): string {
    const matchingTasks: string[] = [];

    for (const task of tasks) {
      // Check if this is an AnalysisTask with rule information
      if (
        "getIncident" in task &&
        typeof (task as any).getIncident === "function"
      ) {
        const analysisTask = task as AnalysisTask;
        const incident = analysisTask.getIncident();

        // Check if this task matches any of the test case rules
        const matches = testCase.rules.some(
          (rule) =>
            incident.ruleSet === rule.ruleset && incident.rule === rule.rule,
        );

        if (matches) {
          matchingTasks.push(`- ${task.toString()}`);
        }
      }
    }

    return matchingTasks.join("\n");
  }

  /**
   * Gets the evaluation model from config
   */
  private async getEvaluationModel(): Promise<BaseChatModel> {
    if (!this.config.models || this.config.models.length === 0) {
      throw new Error("No models configured");
    }

    const evaluationModelConfig = this.config.models.find(
      (model) => model.useForEvaluation,
    );
    if (!evaluationModelConfig) {
      throw new Error(
        "No model configured for evaluation. Set useForEvaluation: true on one of the models in config.",
      );
    }

    try {
      return await createModel(
        evaluationModelConfig.provider,
        evaluationModelConfig.args,
        process.env as Record<string, string>,
        this.logger,
      );
    } catch (error) {
      this.logger.error("Failed to create evaluation model", { error });
      throw new Error(`Failed to create evaluation model: ${error}`);
    }
  }
}
