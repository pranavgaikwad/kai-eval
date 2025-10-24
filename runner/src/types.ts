import { SupportedModelProviders } from "./kai/modelProvider";

export interface KaiRunnerConfig {
  // Logging
  logLevel?: string;
  logDir?: string;

  // Workspace
  workspacePaths?: string[];

  // Model Configuration
  modelProvider?: SupportedModelProviders;
  modelArgs?: Record<string, unknown>;

  // Java Diagnostics
  jdtlsBinaryPath?: string;
  jdtlsBundles?: string[];
  jvmMaxMem?: string;

  // Analysis
  kaiAnalyzerRpcPath?: string;
  rulesPath?: string[];
  targets?: string[];
  sources?: string[];

  // Kai Workflow
  solutionServerUrl?: string;
  traceDir?: string;
}