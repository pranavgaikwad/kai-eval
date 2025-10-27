import { Logger } from "winston";

import { KaiWorkflowManager, SupportedModelProviders } from "../kai";
import { TaskManager } from "../taskManager";
import {
  JavaDiagnosticsInitParams,
  JavaDiagnosticsTasksProvider,
  AnalysisTasksProvider,
  AnalyzerInitParams,
} from "../taskProviders";

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
}

export interface KaiWorkflowSetupResult {
  kaiWorkflowManager: KaiWorkflowManager;
  shutdown: () => Promise<void>;
}

export interface TaskProviderSetupConfig {
  workspacePaths: string[];
  logger: Logger;
  diagnosticsParams?: Omit<JavaDiagnosticsInitParams, "workspacePaths">;
  analysisParams?: Omit<
    AnalyzerInitParams,
    "pipePath" | "excludedPaths" | "workspacePaths"
  >;
}

export interface TaskProviderSetupResult {
  providers: {
    diagnostics?: JavaDiagnosticsTasksProvider;
    analysis?: AnalysisTasksProvider;
  };
  shutdown: () => Promise<void>;
}

// Kai Runner Setup to run fix generation workflow
export interface KaiRunnerSetupResult {
  logger: Logger;
  providersSetup: TaskProviderSetupResult;
  kaiSetup: KaiWorkflowSetupResult;
  taskManager: TaskManager;
  runFunc: (inp: RunKaiWorkflowInput) => Promise<void>;
  shutdown: () => Promise<void>;
}

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
