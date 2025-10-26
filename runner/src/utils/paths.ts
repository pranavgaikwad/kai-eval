import { promises as fs } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { Logger } from "winston";

/**
 * Reads .gitignore and .konveyorignore files from multiple workspace paths
 * and returns a list of absolute paths to exclude based on the patterns found.
 * 
 * @param workspacePaths Array of workspace directory paths to process
 * @returns Promise<string[]> Array of absolute paths to exclude
 */
export async function getExcludedPaths(logger: Logger, workspacePaths: string[]): Promise<string[]> {
  const allExcludedPaths: string[] = [];

  for (const workspacePath of workspacePaths) {
    try {
      logger.debug("Processing ignore files for workspace", { workspacePath });
      const patterns = await getIgnorePatterns(logger, workspacePath);
      if (patterns.length === 0) {
        logger.debug("No ignore patterns found in workspace", { workspacePath });
        continue;
      }
      logger.debug("Found ignore patterns in workspace", { patternCount: patterns.length, workspacePath });
      const { globby } = await import("globby");
      const excludedPaths = await globby(patterns, {
        cwd: workspacePath,
        absolute: true,
        onlyFiles: false,
        markDirectories: true,
        dot: true,
        ignore: [],
      });
      logger.debug("Resolved excluded paths for workspace", { excludedPathCount: excludedPaths.length, workspacePath });
      allExcludedPaths.push(...excludedPaths);
    } catch (error) {
      logger.error("Error processing ignore files for workspace", { workspacePath, error });
    }
  }
  const uniqueExcludedPaths = [...new Set(allExcludedPaths)];
  logger.debug("Total unique excluded paths across all workspaces", { uniqueExcludedPathCount: uniqueExcludedPaths.length });
  return uniqueExcludedPaths;
}


/**
 * Reads and parses ignore patterns from .gitignore and .konveyorignore files
 * in a single workspace directory.
 * 
 * @param workspacePath Path to the workspace directory
 * @returns Promise<string[]> Array of cleaned ignore patterns
 */
async function getIgnorePatterns(logger: Logger, workspacePath: string): Promise<string[]> {
  const patterns: string[] = [];
  const ignoreFiles = ['.gitignore', '.konveyorignore'];
  for (const ignoreFile of ignoreFiles) {
    const ignoreFilePath = path.join(workspacePath, ignoreFile);
    try {
      const content = await fs.readFile(ignoreFilePath, 'utf-8');
      const filePatterns = parseIgnoreFileContent(logger, content);
      patterns.push(...filePatterns);
      logger.debug("Loaded patterns from ignore file", { patternCount: filePatterns.length, ignoreFilePath });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
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
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line || line.startsWith('#')) {
        return false;
      }
      return true;
    })
    .map(pattern => {
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
 * Converts file:// to a local fs path
 * @param path input path to clean
 */
export function fileUriToPath(path: string): string {
  const cleanPath = path.startsWith("file://") ? fileURLToPath(path) : path;
  return process.platform === "win32" && cleanPath.startsWith("/")
    ? cleanPath.replace("/", "")
    : cleanPath;
}