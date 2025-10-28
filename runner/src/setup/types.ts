import { Logger } from "winston";

import {
  FilterTasksFunction,
  KaiWorkflowManager,
  SupportedModelProviders,
} from "../kai";
import { TaskManager } from "../taskManager";
import {
  JavaDiagnosticsInitParams,
  JavaDiagnosticsTasksProvider,
  AnalysisTasksProvider,
  AnalyzerInitParams,
} from "../taskProviders";

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
  filterTasksFunc?: FilterTasksFunction; // function to filter tasks for user interaction
}
// Result of setting up a Kai workflow for fix generation
export interface KaiWorkflowSetupResult {
  kaiWorkflowManager: KaiWorkflowManager;
  shutdown: () => Promise<void>;
}

// Consolidated config to setup task providers
export interface TaskProviderSetupConfig {
  workspacePaths: string[];
  logger: Logger;
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
