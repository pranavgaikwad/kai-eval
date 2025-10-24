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
    return JSON.parse(configData) as KaiRunnerConfig;
  } catch (error) {
    if (options.configPath) {
      throw new Error(`Failed to load config file: ${configPath}. Error: ${error}`);
    }
    // If no explicit config path provided and default doesn't exist, return empty config
    return {};
  }
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