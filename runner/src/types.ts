import { SupportedModelProviders } from "./kai/modelProvider";

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
  modelProvider?: SupportedModelProviders;
  modelArgs?: Record<string, unknown>;

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