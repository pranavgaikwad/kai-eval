import { SupportedModelProviders } from "./kai";

export interface KaiRunnerConfig {
  // Logging
  logLevel?: {
    console: string;
    file: string;
  };
  logDir?: string;

  // Workspace
  workspacePaths?: string[];

  // Model Configuration
  models?: Array<{
    provider: SupportedModelProviders;
    args: Record<string, unknown>;
    useForEvaluation?: boolean;
  }>;

  // Evaluation
  // Java Diagnostics
  jdtlsBinaryPath?: string;
  jdtlsBundles?: string[];
  jvmMaxMem?: string;

  // Analysis
  kaiAnalyzerRpcPath?: string;
  rulesPaths?: string[];
  targets?: string[];
  sources?: string[];

  // Kai Workflow
  solutionServerUrl?: string;
}
