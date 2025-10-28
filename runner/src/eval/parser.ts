import { promises as fs } from "fs";

import { load as yamlLoad } from "js-yaml";
import { glob as globby } from "tinyglobby";

import type { TestApplication, TestCase } from "./types";
import { fstat } from "fs";
import path from "path";

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly field?: string,
  ) {
    super(
      `Parse error in ${filePath}${field ? ` (field: ${field})` : ""}: ${message}`,
    );
    this.name = "ParseError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly field: string,
  ) {
    super(`Validation error in ${filePath} (field: ${field}): ${message}`);
    this.name = "ValidationError";
  }
}

export class ReferenceError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly referencedApp: string,
  ) {
    super(
      `Reference error in ${filePath}: ${message} (referenced app: ${referencedApp})`,
    );
    this.name = "ReferenceError";
  }
}

function validateRequired<T>(
  value: T,
  fieldName: string,
  filePath: string,
): NonNullable<T> {
  if (value === undefined || value === null) {
    throw new ValidationError(`Required field is missing`, filePath, fieldName);
  }
  return value as NonNullable<T>;
}

function validateString(
  value: unknown,
  fieldName: string,
  filePath: string,
): string {
  validateRequired(value, fieldName, filePath);
  if (typeof value !== "string") {
    throw new ValidationError(
      `Expected string, got ${typeof value}`,
      filePath,
      fieldName,
    );
  }
  if (value.trim() === "") {
    throw new ValidationError(`String cannot be empty`, filePath, fieldName);
  }
  return value;
}

function validateArray<T>(
  value: unknown,
  fieldName: string,
  filePath: string,
  required = false,
): T[] {
  if (!required && (value === undefined || value === null)) {
    return [];
  }
  validateRequired(value, fieldName, filePath);
  if (!Array.isArray(value)) {
    throw new ValidationError(
      `Expected array, got ${typeof value}`,
      filePath,
      fieldName,
    );
  }
  return value;
}

/**
 * Parse TestApplication from app.yaml content
 */
async function parseTestApplication(
  content: string,
  filePath: string,
): Promise<TestApplication> {
  let data: unknown;
  try {
    data = yamlLoad(content);
  } catch (error) {
    throw new ParseError(
      `Invalid YAML: ${error instanceof Error ? error.message : "Unknown error"}`,
      filePath,
    );
  }

  if (typeof data !== "object" || data === null) {
    throw new ParseError("YAML root must be an object", filePath);
  }

  const obj = data as Record<string, unknown>;

  const name = validateString(obj.name, "name", filePath);
  const programmingLanguage = validateString(
    obj.programmingLanguage,
    "programmingLanguage",
    filePath,
  );

  const sourceCodeRaw = validateRequired(
    obj.sourceCode,
    "sourceCode",
    filePath,
  );
  if (typeof sourceCodeRaw !== "object" || sourceCodeRaw === null) {
    throw new ValidationError("Expected object", filePath, "sourceCode");
  }

  const sourceCodeObj = sourceCodeRaw as Record<string, unknown>;
  const sourceType = validateString(
    sourceCodeObj.type,
    "sourceCode.type",
    filePath,
  );

  let sourceCode: TestApplication["sourceCode"];
  if (sourceType === "git") {
    sourceCode = {
      type: "git",
      url: validateString(sourceCodeObj.url, "sourceCode.url", filePath),
      branch: validateString(
        sourceCodeObj.branch,
        "sourceCode.branch",
        filePath,
      ),
    };
    if (sourceCodeObj.path) {
      sourceCode.path = validateString(
        sourceCodeObj.path,
        "sourceCode.path",
        filePath,
      );
    }
  } else if (sourceType === "local") {
    sourceCode = {
      type: "local",
      path: validateString(sourceCodeObj.path, "sourceCode.path", filePath),
    };
  } else {
    throw new ValidationError(
      `Invalid sourceCode.type: ${sourceType}. Must be 'git' or 'local'`,
      filePath,
      "sourceCode.type",
    );
  }

  const sources = validateArray<string>(obj.sources, "sources", filePath);
  const targets = validateArray<string>(obj.targets, "targets", filePath);

  sources.forEach((source, index) => {
    if (typeof source !== "string") {
      throw new ValidationError(
        `Array element at index ${index} must be string, got ${typeof source}`,
        filePath,
        "sources",
      );
    }
  });
  targets.forEach((target, index) => {
    if (typeof target !== "string") {
      throw new ValidationError(
        `Array element at index ${index} must be string, got ${typeof target}`,
        filePath,
        "targets",
      );
    }
  });

  let architecture = "";
  try {
    architecture = await fs.readFile(
      path.join(path.dirname(filePath), "architecture.md"),
      "utf-8",
    );
  } catch (error) {
    throw new ParseError(
      `Failed to read architecture: ${error instanceof Error ? error.message : "Unknown error"}`,
      filePath,
    );
  }
  return {
    path: filePath,
    name,
    sourceCode,
    sources: sources.length > 0 ? sources : undefined,
    targets: targets.length > 0 ? targets : undefined,
    programmingLanguage,
    architecture,
  };
}

/**
 * Parse TestCase from tc.yaml content
 */
async function parseTestCase(
  content: string,
  filePath: string,
  applications: Map<string, TestApplication>,
): Promise<TestCase> {
  let data: unknown;
  try {
    data = yamlLoad(content);
  } catch (error) {
    throw new ParseError(
      `Invalid YAML: ${error instanceof Error ? error.message : "Unknown error"}`,
      filePath,
    );
  }

  if (typeof data !== "object" || data === null) {
    throw new ParseError("YAML root must be an object", filePath);
  }

  const obj = data as Record<string, unknown>;

  const name = validateString(obj.name, "name", filePath);
  const description = validateString(obj.description, "description", filePath);
  const migrationHint = validateString(
    obj.migrationHint,
    "migrationHint",
    filePath,
  );

  const rulesRaw = validateRequired(obj.rules, "rules", filePath);
  if (!Array.isArray(rulesRaw)) {
    throw new ValidationError("Expected array", filePath, "rules");
  }

  const rules = rulesRaw.map((rule, index) => {
    if (typeof rule !== "object" || rule === null) {
      throw new ValidationError(
        `Array element at index ${index} must be object, got ${typeof rule}`,
        filePath,
        "rules",
      );
    }
    const ruleObj = rule as Record<string, unknown>;
    return {
      ruleset: validateString(
        ruleObj.ruleset,
        `rules[${index}].ruleset`,
        filePath,
      ),
      rule: validateString(ruleObj.rule, `rules[${index}].rule`, filePath),
    };
  });

  const testSelectors = validateArray<string>(
    obj.testSelectors,
    "testSelectors",
    filePath,
  );
  testSelectors.forEach((selector, index) => {
    if (typeof selector !== "string") {
      throw new ValidationError(
        `Array element at index ${index} must be string, got ${typeof selector}`,
        filePath,
        "testSelectors",
      );
    }
  });

  if (!obj.app) {
    throw new ValidationError(
      "Required field 'app' is missing",
      filePath,
      "app",
    );
  }

  const appName = validateString(obj.app, "app", filePath);
  if (!applications.has(appName)) {
    throw new ReferenceError(
      `Referenced application '${appName}' not found`,
      filePath,
      appName,
    );
  }

  let notes = "";
  try {
    notes = await fs.readFile(
      path.join(path.dirname(filePath), "notes.md"),
      "utf-8",
    );
  } catch (error) {
    throw new ParseError(
      `Failed to read notes: ${error instanceof Error ? error.message : "Unknown error"}`,
      filePath,
    );
  }

  return {
    path: filePath,
    name,
    description,
    rules,
    migrationHint,
    testSelectors: testSelectors.length > 0 ? testSelectors : undefined,
    application: applications.get(appName) as TestApplication,
    notes,
  };
}

export async function parseTestCasesFromDirectory(
  basePath: string,
): Promise<TestCase[]> {
  const appFiles = await globby("**/app.yaml", {
    cwd: basePath,
    absolute: true,
  });
  const applications = new Map<string, TestApplication>();

  for (const appFile of appFiles) {
    try {
      const content = await fs.readFile(appFile, "utf-8");
      const app = await parseTestApplication(content, appFile);

      if (applications.has(app.name)) {
        throw new ParseError(
          `Duplicate application name '${app.name}' found`,
          appFile,
        );
      }

      applications.set(app.name, app);
    } catch (error) {
      if (error instanceof ParseError || error instanceof ValidationError) {
        throw error;
      }
      throw new ParseError(
        `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
        appFile,
      );
    }
  }

  const testCaseFiles = await globby("**/tc.yaml", {
    cwd: basePath,
    absolute: true,
  });
  const testCases: TestCase[] = [];

  for (const tcFile of testCaseFiles) {
    try {
      const content = await fs.readFile(tcFile, "utf-8");
      const testCase = await parseTestCase(content, tcFile, applications);
      testCases.push(testCase);
    } catch (error) {
      if (
        error instanceof ParseError ||
        error instanceof ValidationError ||
        error instanceof ReferenceError
      ) {
        throw error;
      }
      throw new ParseError(
        `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
        tcFile,
      );
    }
  }

  return testCases;
}
