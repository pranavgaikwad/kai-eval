import { promises as fs } from "fs";
import * as path from "path";

export async function loadTestEnvironment(): Promise<void> {
  const projectRoot = path.resolve(__dirname, "..");
  const envFile = path.join(projectRoot, ".env");

  try {
    await fs.access(envFile);
    const envContent = await fs.readFile(envFile, "utf-8");
    const envLines = envContent.split("\n");

    for (const line of envLines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const equalIndex = trimmedLine.indexOf("=");
      if (equalIndex === -1) {
        continue;
      }

      const key = trimmedLine.substring(0, equalIndex).trim();
      const value = trimmedLine.substring(equalIndex + 1).trim();
      const cleanValue = value.replace(/^["']|["']$/g, "");

      if (!process.env[key]) {
        process.env[key] = cleanValue;
      }
    }

    console.log("✅ Environment variables loaded from .env file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn("⚠️  No .env file found. Copy .env.example to .env and configure required variables.");
      throw new Error("Missing .env file. Copy .env.example to .env and configure required variables.");
    } else {
      console.error("❌ Error loading .env file:", error);
      throw error;
    }
  }
}

export function validateJavaTestEnvironment(): void {
  const requiredVars = ["JDTLS_BINARY_PATH", "JDTLS_BUNDLES"];
  const missing: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables for Java tests: ${missing.join(", ")}`);
  }
}

export function validateAnalyzerTestEnvironment(): void {
  const requiredVars = ["KAI_ANALYZER_RPC_PATH", "RULES_PATH", "TARGETS", "SOURCES"];
  const missing: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables for analyzer tests: ${missing.join(", ")}`);
  }
}