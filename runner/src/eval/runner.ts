import { exec } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

import { type BaseChatModel } from "@langchain/core/language_models/chat_models";
import { type Logger } from "winston";

import { runEvaluation } from "./agents";
import { EvaluationTools } from "./tools";
import {
  type EvaluationRunner,
  type TestCase,
  type TestCaseResults,
  type ExperimentResults,
  type TestApplication,
  type EvaluationToolOptions,
  type EvaluationRunOptions as RunEvaluationOptions,
  type TestCaseVariant,
  type GetTaskManagerFunction,
  type KaiRunnerFunction,
} from "./types";
import { type SupportedModelProviders, createModel } from "../kai";
import { type TaskManager } from "../taskManager";
import { AnalysisTask, DiagnosticTask, type Task } from "../taskProviders";
import { type KaiRunnerConfig } from "../types";
import { getAllFiles, getChangedFiles } from "../utils/paths";

const execAsync = promisify(exec);

interface ApplicationGroup {
  application: TestApplication;
  testCases: TestCase[];
}

interface ApplicationSetup {
  workspacePath: string;
  taskManager: TaskManager;
  shutdownFunc: () => Promise<void>;
}

/**
 * Evaluation runner that groups test cases by applications, and re-uses the same setup of providers,
 * task manager, for all test cases in the application resetting the state between test cases.
 */
export class DefaultEvaluationRunner implements EvaluationRunner {
  private readonly artifactsPath: string;

  constructor(
    private readonly config: KaiRunnerConfig,
    private readonly getTaskManagerFunc: GetTaskManagerFunction,
    private readonly kaiRunnerFunc: KaiRunnerFunction,
    private readonly logger: Logger,
    artifactsPath?: string,
  ) {
    this.artifactsPath =
      artifactsPath || path.join(os.tmpdir(), "eval-artifacts");
    this.logger = logger.child({ module: "OptimizedEvaluationRunner" });
  }

  async run(
    testCases: TestCase[],
    opts: RunEvaluationOptions,
  ): Promise<TestCaseResults[]> {
    this.logger.info(
      `Starting evaluation runner with ${testCases.length} test cases`,
    );

    if (!this.config.models || !this.config.models.length) {
      throw new Error("No models specified in configuration");
    }

    const variants = opts.variants || [
      {
        name: "basic",
        agentMode: false,
      },
      {
        name: "agent",
        agentMode: true,
      },
    ];

    // Group test cases by application
    const applicationGroups = this.groupTestCasesByApplication(testCases);
    this.logger.debug(
      `Grouped ${testCases.length} test cases into ${applicationGroups.length} applications`,
    );

    const results: TestCaseResults[] = [];

    // Process each application group at once
    for (const group of applicationGroups) {
      this.logger.info(
        `Processing application: ${group.application.name} with ${group.testCases.length} test cases`,
      );

      try {
        const applicationSetup = await this.setupApplicationGroup(group);

        try {
          const groupResults = await this.runTCsForApplication(
            group,
            variants,
            applicationSetup,
          );
          results.push(...groupResults);
        } finally {
          await applicationSetup.shutdownFunc();
        }
      } catch (error) {
        this.logger.error(
          `Failed to process application group: ${group.application.name}`,
          { error },
        );
        // Add error results for all test cases in this group
        for (const testCase of group.testCases) {
          results.push({
            testCase,
            errors: [error instanceof Error ? error : new Error(String(error))],
            results: [],
          });
        }
      }
    }

    this.logger.info(
      `Evaluation run completed. Processed ${results.length} test cases`,
    );
    return results;
  }

  private groupTestCasesByApplication(
    testCases: TestCase[],
  ): ApplicationGroup[] {
    const groups = new Map<string, ApplicationGroup>();

    for (const testCase of testCases) {
      const appName = testCase.application.name;
      if (!groups.has(appName)) {
        groups.set(appName, {
          application: testCase.application,
          testCases: [],
        });
      }
      groups.get(appName)!.testCases.push(testCase);
    }

    return Array.from(groups.values());
  }

  private async setupApplicationGroup(
    group: ApplicationGroup,
  ): Promise<ApplicationSetup> {
    this.logger.debug(`Setting up application: ${group.application.name}`);

    const applicationArtifactDir = path.join(
      this.artifactsPath,
      "apps",
      group.application.name,
    );
    await this.ensureDirectoryExists(applicationArtifactDir);

    const { workspacePath } = await this.setupTestApplication(
      group.application,
      applicationArtifactDir,
    );

    const testConfig = this.createTestConfig(workspacePath, group.application);

    // Setup task manager
    const { taskManager, shutdownFunc } = await this.getTaskManagerFunc(
      this.logger,
      testConfig,
      group.application,
    );

    this.logger.debug(`Application setup complete: ${group.application.name}`, {
      workspacePath,
    });

    return {
      workspacePath,
      taskManager,
      shutdownFunc,
    };
  }

  private async runTCsForApplication(
    group: ApplicationGroup,
    variants: TestCaseVariant[],
    applicationSetup: ApplicationSetup,
  ): Promise<TestCaseResults[]> {
    const results: TestCaseResults[] = [];

    for (const testCase of group.testCases) {
      this.logger.silly(`Processing test case: ${testCase.name}`);

      const testCaseResults: TestCaseResults = {
        testCase,
        errors: [],
        results: [],
      };

      try {
        for (const variant of variants) {
          this.logger.silly(
            `Using variant: ${variant.name} for test case: ${testCase.name}`,
          );
          const selectedModels = this.config.models || [];
          for (const modelConfig of selectedModels.filter(
            (model) => !model.useForEvaluation,
          )) {
            this.logger.info("Running test case", {
              testCase: testCase.name,
              variant: variant.name,
              model: `${modelConfig.provider}/${modelConfig.args.model || modelConfig.args.modelName || modelConfig.args.modelId || "<omitted>"}`,
            });

            try {
              const experimentResult = await this.executeIndividualTestRun(
                testCase,
                variant,
                modelConfig,
                applicationSetup,
              );
              testCaseResults.results.push(experimentResult);
            } catch (error) {
              this.logger.error(
                `Failed to run test case ${testCase.name} with model ${modelConfig.provider} and variant ${variant.name}`,
                { error },
              );
              testCaseResults.errors.push(
                error instanceof Error ? error : new Error(String(error)),
              );
            } finally {
              this.logger.debug("Resetting task manager");
              applicationSetup.taskManager.reset();
              await this.resetWorkspace(applicationSetup.workspacePath);
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

    return results;
  }

  private async executeIndividualTestRun(
    testCase: TestCase,
    variant: TestCaseVariant,
    modelConfig: {
      provider: SupportedModelProviders;
      args: Record<string, unknown>;
    },
    applicationSetup: ApplicationSetup,
  ): Promise<ExperimentResults> {
    this.logger.debug(
      `Executing individual test run: ${testCase.name} - ${variant.name} - ${modelConfig.provider}`,
    );

    const { workspacePath, taskManager } = applicationSetup;

    const testConfig = this.createTestConfig(
      workspacePath,
      testCase.application,
    );

    // Collect pre-migration data
    this.logger.debug("Collecting pre-migration data");
    const fileListBefore = await getAllFiles(this.logger, workspacePath);
    const tasksBefore = await this.getAllTasks(taskManager);

    // Run Kai workflow
    this.logger.debug("Running Kai workflow");
    let workflowError: Error | undefined = undefined;
    try {
      await this.kaiRunnerFunc(
        this.logger,
        testCase,
        testCase.application,
        variant,
        {
          ...testConfig,
          models: [modelConfig],
        },
      );
    } catch (error) {
      this.logger.error("Failed to run Kai workflow", {
        error,
        testCase: testCase.name,
        variant: variant.name,
        modelProvider: modelConfig.provider,
        model:
          modelConfig.args.model ||
          modelConfig.args.modelName ||
          modelConfig.args.modelId ||
          "<unknown_model>",
      });
      workflowError = new Error(
        `Failed to run Kai workflow - ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second to ensure notify file changes are processed

    let diff = "";
    try {
      const result = await this.getGitDiff(workspacePath);
      diff = result;
    } catch (error) {
      this.logger.error("Failed to get git diff for test case", {
        error,
        testCase: testCase.name,
        variant: variant.name,
        modelProvider: modelConfig.provider,
        model:
          modelConfig.args.model ||
          modelConfig.args.modelName ||
          modelConfig.args.modelId ||
          "<unknown_model>",
      });
    }

    // Collect post-migration data
    this.logger.debug("Collecting post-migration data");
    const fileListAfter = await getAllFiles(this.logger, workspacePath);
    const changedFilePaths = await getChangedFiles(this.logger, workspacePath);
    const changedFiles = await this.getChangedFilesContent(
      workspacePath,
      changedFilePaths,
    );
    const tasksAfter = await this.getAllTasks(taskManager);

    // Prepare evaluation
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
      appArchitecture: testCase.application.architecture,
      originalRules: testCase.rules,
    };

    const evaluationTools = new EvaluationTools(
      evaluationOptions,
      workspacePath,
      this.logger,
    );

    // Get matching issues from before tasks
    const issues = this.getMatchingIssues(testCase, tasksBefore.analysisTasks);

    // Create evaluation model
    const evaluationModel = await this.getEvaluationModel();

    this.logger.debug("Evaluation tools prepared", {
      analysisBefore: tasksBefore.analysisTasks.length,
      analysisAfter: tasksAfter.analysisTasks.length,
      diagnosticsBefore: tasksBefore.diagnosticsTasks.length,
      diagnosticsAfter: tasksAfter.diagnosticsTasks.length,
      filesBefore: fileListBefore.length,
      filesAfter: fileListAfter.length,
      changedFiles: changedFiles.size,
      issuesMatched: issues.split("\n").filter((line) => line.trim()).length,
    });

    // Run evaluation agents
    const agentResults = await runEvaluation({
      testCase,
      evaluationTools,
      issues,
      model: evaluationModel,
      logger: this.logger,
    });

    const error = [
      agentResults.completeness.error,
      agentResults.functionalParity.error,
      agentResults.residualEffort.error,
      workflowError?.message,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      name: variant.name,
      model: `${modelConfig.provider}/${modelConfig.args.model || modelConfig.args.modelName || modelConfig.args.modelId || "<unknown_model>"}`,
      completeness: agentResults.completeness.metric,
      functionalParity: agentResults.functionalParity.metric,
      residualEffort: agentResults.residualEffort.metric,
      error: error || undefined,
      diff,
    };
  }

  private async getAllTasks(taskManager: TaskManager): Promise<{
    analysisTasks: AnalysisTask[];
    diagnosticsTasks: DiagnosticTask[];
  }> {
    const snapshotId = await taskManager.getTasks();

    const analysisTasks = taskManager
      .getAllTasksForSnapshot(snapshotId)
      .filter((task) => task instanceof AnalysisTask) as AnalysisTask[];
    const diagnosticsTasks = taskManager
      .getAllTasksForSnapshot(snapshotId)
      .filter((task) => task instanceof DiagnosticTask) as DiagnosticTask[];

    return {
      analysisTasks,
      diagnosticsTasks,
    };
  }

  private async resetWorkspace(workspacePath: string): Promise<void> {
    this.logger.debug("Resetting workspace to clean state");
    try {
      await execAsync("git reset --hard", { cwd: workspacePath });
      this.logger.debug("Workspace reset successful");
    } catch (error) {
      this.logger.warn(
        "Failed to reset workspace (no git repo or other issue)",
        { error },
      );
    }
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
    application: TestApplication,
    sourceDir: string,
  ): Promise<{ workspacePath: string; application: TestApplication }> {
    await this.ensureDirectoryExists(sourceDir);

    const sourceCode = application.sourceCode;
    let repoPath = sourceDir;

    try {
      await fs.rm(sourceDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.error(`Failed to remove directory ${sourceDir}`, { error });
    }

    if (sourceCode.type === "git") {
      this.logger.debug(
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
      this.logger.debug(`Copying local files from ${sourceCode.path}`);
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
    workspacePath: string,
    application: TestApplication,
  ): KaiRunnerConfig {
    const baseConfig = { ...this.config };
    baseConfig.workspacePaths = [workspacePath];
    if (application.sources) {
      baseConfig.sources = application.sources;
    }
    if (application.targets) {
      baseConfig.targets = application.targets;
    }
    return baseConfig;
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

  private async getGitDiff(workspacePath: string): Promise<string> {
    await execAsync("git add .", {
      cwd: workspacePath,
    });
    const { stdout } = await execAsync("git diff --staged", {
      cwd: workspacePath,
    });
    return stdout;
  }

  private getMatchingIssues(testCase: TestCase, tasks: Task[]): string {
    const matchingTasks: string[] = [];
    for (const task of tasks) {
      if (task instanceof AnalysisTask) {
        const analysisTask = task as AnalysisTask;
        const incident = analysisTask.getIncident();
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
