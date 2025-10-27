import { promises as fs } from "fs";
import * as path from "path";

import * as dotenv from "dotenv";

import { KaiRunnerConfig } from "../types";

export interface ConfigLoadOptions {
  configPath?: string;
  envPath?: string;
  workingDir?: string;
}

export async function loadConfig(options: ConfigLoadOptions = {}): Promise<KaiRunnerConfig> {
  const workingDir = options.workingDir || process.cwd();
  const configPath = options.configPath || path.join(workingDir, ".config.json");

  try {
    const configData = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configData) as KaiRunnerConfig;

    // Resolve and validate paths relative to config file directory
    const configDir = path.dirname(path.resolve(configPath));
    return await resolvePaths(config, configDir);
  } catch (error) {
    if (options.configPath) {
      throw new Error(`Failed to load config file: ${configPath}. Error: ${error}`);
    }
    // If no explicit config path provided and default doesn't exist, return empty config
    return {};
  }
}

async function resolvePaths(config: KaiRunnerConfig, configDir: string): Promise<KaiRunnerConfig> {
  const resolvedConfig = { ...config };
  const resolvePath = (filePath: string): string => {
    return path.isAbsolute(filePath) ? filePath : path.resolve(configDir, filePath);
  };

  if (config.logDir) {
    resolvedConfig.logDir = resolvePath(config.logDir);
  }

  if (config.workspacePaths) {
    resolvedConfig.workspacePaths = [];
    for (const workspacePath of config.workspacePaths) {
      const resolved = resolvePath(workspacePath);
      resolvedConfig.workspacePaths.push(resolved);
    }
  }

  if (config.jdtlsBinaryPath) {
    resolvedConfig.jdtlsBinaryPath = resolvePath(config.jdtlsBinaryPath);
  }

  if (config.kaiAnalyzerRpcPath) {
    resolvedConfig.kaiAnalyzerRpcPath = resolvePath(config.kaiAnalyzerRpcPath);
  }

  if (config.jdtlsBundles) {
    resolvedConfig.jdtlsBundles = [];
    for (const bundle of config.jdtlsBundles) {
      const resolved = resolvePath(bundle);
      resolvedConfig.jdtlsBundles.push(resolved);
    }
  }

  if (config.rulesPaths) {
    resolvedConfig.rulesPaths = [];
    for (const rulesPath of config.rulesPaths) {
      const resolved = resolvePath(rulesPath);
      resolvedConfig.rulesPaths.push(resolved);
    }
  }

  return resolvedConfig;
}

export function loadEnv(options: ConfigLoadOptions = {}): Record<string, string> {
  const workingDir = options.workingDir || process.cwd();
  const envPath = options.envPath || path.join(workingDir, ".env");

  // Load environment variables from .env file
  const result = dotenv.config({ path: envPath });

  if (result.error && options.envPath) {
    throw new Error(`Failed to load env file: ${envPath}. Error: ${result.error}`);
  }

  return process.env as Record<string, string>;
}

export async function getConfig(options: ConfigLoadOptions = {}): Promise<{
  config: KaiRunnerConfig;
  env: Record<string, string>;
}> {
  const config = await loadConfig(options);
  const env = loadEnv(options);

  return { config, env };
}