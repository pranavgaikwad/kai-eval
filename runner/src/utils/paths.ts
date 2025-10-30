import { exec } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

import { glob as globby } from "tinyglobby";
import type { Logger } from "winston";

const execAsync = promisify(exec);
/**
 * Reads .gitignore and .konveyorignore files from multiple workspace paths
 * and returns a list of absolute paths to exclude based on the patterns found.
 *
 * @param workspacePaths Array of workspace directory paths to process
 * @returns Promise<string[]> Array of absolute paths to exclude
 */
export async function getExcludedPaths(
  logger: Logger,
  workspacePaths: string[],
): Promise<string[]> {
  const allExcludedPaths: string[] = [];

  for (const workspacePath of workspacePaths) {
    try {
      logger.debug("Processing ignore files for workspace", { workspacePath });
      const patterns = await getIgnorePatterns(logger, workspacePath);
      if (patterns.length === 0) {
        logger.debug("No ignore patterns found in workspace", {
          workspacePath,
        });
        continue;
      }
      logger.debug("Found ignore patterns in workspace", {
        patternCount: patterns.length,
        workspacePath,
      });
      const excludedPaths = await globby(patterns, {
        cwd: workspacePath,
        absolute: true,
        onlyFiles: false,
        dot: true,
        ignore: [],
        followSymbolicLinks: false,
      });
      logger.debug("Resolved excluded paths for workspace", {
        excludedPathCount: excludedPaths.length,
        workspacePath,
      });
      allExcludedPaths.push(...excludedPaths);
    } catch (error) {
      logger.error("Error processing ignore files for workspace", {
        workspacePath,
        error,
      });
    }
  }
  const uniqueExcludedPaths = [...new Set(allExcludedPaths)];
  logger.debug("Total unique excluded paths across all workspaces", {
    uniqueExcludedPathCount: uniqueExcludedPaths.length,
  });
  return uniqueExcludedPaths;
}

/**
 * Reads and parses ignore patterns from .gitignore and .konveyorignore files
 * in a single workspace directory.
 *
 * @param workspacePath Path to the workspace directory
 * @returns Promise<string[]> Array of cleaned ignore patterns
 */
async function getIgnorePatterns(
  logger: Logger,
  workspacePath: string,
): Promise<string[]> {
  const patterns: string[] = [];
  const ignoreFiles = [".gitignore", ".konveyorignore"];
  for (const ignoreFile of ignoreFiles) {
    const ignoreFilePath = path.join(workspacePath, ignoreFile);
    try {
      const content = await fs.readFile(ignoreFilePath, "utf-8");
      const filePatterns = parseIgnoreFileContent(logger, content);
      patterns.push(...filePatterns);
      logger.debug("Loaded patterns from ignore file", {
        patternCount: filePatterns.length,
        ignoreFilePath,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        logger.debug("Ignore file not found", { ignoreFilePath });
      } else {
        logger.error("Error reading ignore file", { ignoreFilePath, error });
      }
    }
  }
  return patterns;
}

/**
 * Parses the content of an ignore file and returns cleaned patterns.
 *
 * @param content Raw content of the ignore file
 * @returns string[] Array of cleaned patterns
 */
function parseIgnoreFileContent(logger: Logger, content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || line.startsWith("#")) {
        return false;
      }
      return true;
    })
    .map((pattern) => {
      logger.debug("Parsed ignore pattern", { pattern });
      return pattern;
    });
}

/**
 * Adds file:// to a local path
 * @param filePath string file path
 * @returns
 */
export function pathToUri(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");
  if (normalizedPath.startsWith("/")) {
    return `file://${normalizedPath}`;
  } else {
    return `file:///${normalizedPath}`;
  }
}

/**
 * Gets all files matching a pattern, respecting .gitignore and .konveyorignore
 *
 * @param logger Logger instance
 * @param workspacePath Path to workspace directory
 * @param pattern Glob pattern to match
 * @returns Promise<string[]> Array of relative file paths
 */
export async function getMatchingFiles(
  logger: Logger,
  workspacePath: string,
  pattern: string = "**/*.java",
): Promise<string[]> {
  try {
    const ignorePatterns = await getIgnorePatterns(logger, workspacePath);

    // Add default ignore patterns for common build artifacts and VCS directories
    const defaultIgnores = [
      "**/target/**",
      "**/build/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/.git/**",
      "**/.svn/**",
      "**/.hg/**",
      "**/*.class",
      "**/*.jar",
      "**/*.war",
      "**/*.ear",
    ];

    const allIgnorePatterns = [...ignorePatterns, ...defaultIgnores];

    const files = await globby(pattern, {
      cwd: workspacePath,
      ignore: allIgnorePatterns,
      absolute: false,
      onlyFiles: true,
      dot: false,
    });

    logger.debug("Found matching files in workspace", {
      workspacePath,
      pattern,
      fileCount: files.length,
    });

    return files.sort();
  } catch (error) {
    logger.error("Error getting matching files", {
      workspacePath,
      pattern,
      error,
    });
    return [];
  }
}

/**
 * Gets all files in the workspace, respecting ignore files
 *
 * @param logger Logger instance
 * @param workspacePath Path to workspace directory
 * @returns Promise<string[]> Array of relative file paths
 */
export async function getAllFiles(
  logger: Logger,
  workspacePath: string,
): Promise<string[]> {
  return getMatchingFiles(logger, workspacePath, "**/*");
}

/**
 * Gets changed files using git diff
 *
 * @param logger Logger instance
 * @param workspacePath Path to workspace directory
 * @returns Promise<string[]> Array of relative file paths that have changed
 */
export async function getChangedFiles(
  logger: Logger,
  workspacePath: string,
): Promise<string[]> {
  try {
    const { stdout } = await execAsync("git diff --name-only", {
      cwd: workspacePath,
    });

    const changedFiles = stdout
      .trim()
      .split("\n")
      .filter((file) => file.trim())
      .sort();

    logger.debug("Found changed files in workspace", {
      workspacePath,
      changedFileCount: changedFiles.length,
    });

    return changedFiles;
  } catch (error) {
    logger.debug("No git repository or no changes found", {
      workspacePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Converts file:// to a local fs path
 * @param path input path to clean
 */
export function fileUriToPath(path: string): string {
  const cleanPath = path.startsWith("file://") ? fileURLToPath(path) : path;
  return process.platform === "win32" && cleanPath.startsWith("/")
    ? cleanPath.replace("/", "")
    : cleanPath;
}
