import { type Logger } from "winston";

import {
  type EvaluationRunner,
  type GetTaskManagerAndKaiRunnerFunction,
} from "../eval";
import type {
  AgentTasksProviderFunction,
  KaiWorkflowManager,
  SupportedModelProviders,
} from "../kai";
import type { TaskManager } from "../taskManager";
import type {
  JavaDiagnosticsInitParams,
  JavaDiagnosticsTasksProvider,
  AnalysisTasksProvider,
  AnalyzerInitParams,
} from "../taskProviders";
import { type KaiRunnerConfig } from "../types";

// Consolidated config to setup a Kai workflow for fix generation
export interface KaiWorkflowSetupConfig {
  workspaceDir: string;
  logger: Logger;
  taskManager: TaskManager;
  modelConfig?: {
    provider: SupportedModelProviders;
    args: Record<string, unknown>;
  };
  env?: Record<string, string>;
  solutionServerUrl?: string;
  logDir: string;
  /*
   * function to filter tasks for user interaction
   */
  filterTasksFunc?: AgentTasksProviderFunction;
}
// Result of setting up a Kai workflow for fix generation
export interface KaiWorkflowSetupResult {
  kaiWorkflowManager: KaiWorkflowManager;
  shutdown: () => Promise<void>;
}

// Consolidated config to setup task providers
export interface TaskProviderSetupConfig {
  workspacePaths: string[];
  logger?: Logger;
  diagnosticsParams?: Omit<JavaDiagnosticsInitParams, "workspacePaths">;
  analysisParams?: Omit<
    AnalyzerInitParams,
    "pipePath" | "excludedPaths" | "workspacePaths"
  >;
}
// Result of setting up task providers
export interface TaskProviderSetupResult {
  providers: {
    diagnostics?: JavaDiagnosticsTasksProvider;
    analysis?: AnalysisTasksProvider;
  };
  shutdown: () => Promise<void>;
}

// Consolidated result of setting up a Kai runner for fix generation workflow
export interface KaiRunnerSetupResult {
  logger: Logger;
  providersSetup: TaskProviderSetupResult;
  kaiSetup: KaiWorkflowSetupResult;
  taskManager: TaskManager;
  runFunc: (inp: RunKaiWorkflowInput) => Promise<void>;
  shutdown: () => Promise<void>;
}

// Input to run a Kai workflow for fix generation
export type RunKaiWorkflowInput = {
  kind: "fixByRules";
  data: {
    rules: {
      ruleset: string;
      rule: string;
    }[];
    migrationHint: string;
    programmingLanguage: string;
    agentMode: boolean;
  };
};

export interface KaiEvalSetupConfig {
  readonly config: KaiRunnerConfig;
  readonly storeSnapshots?: boolean;
  readonly artifactsPath?: string;
  readonly agentTasksProviderFunc?: AgentTasksProviderFunction;
  readonly taskManagerAndKaiRunnerFunc?: GetTaskManagerAndKaiRunnerFunction;
}

export interface KaiEvalSetupResult {
  readonly evaluationRunner: EvaluationRunner;
}
