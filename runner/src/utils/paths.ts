import { promises as fs } from "fs";
import * as path from "path";

import { globby } from "globby";
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
      logger.info("Processing ignore files for workspace", { workspacePath });
      const patterns = await getIgnorePatterns(logger, workspacePath);
      if (patterns.length === 0) {
        logger.info("No ignore patterns found in workspace", { workspacePath });
        continue;
      }
      logger.info("Found ignore patterns in workspace", { patternCount: patterns.length, workspacePath });
      const excludedPaths = await globby(patterns, {
        cwd: workspacePath,
        absolute: true,
        onlyFiles: false,
        markDirectories: true,
        dot: true,
        ignore: [],
      });
      logger.info("Resolved excluded paths for workspace", { excludedPathCount: excludedPaths.length, workspacePath });
      allExcludedPaths.push(...excludedPaths);
    } catch (error) {
      logger.error("Error processing ignore files for workspace", { workspacePath, error });
    }
  }
  const uniqueExcludedPaths = [...new Set(allExcludedPaths)];
  logger.info("Total unique excluded paths across all workspaces", { uniqueExcludedPathCount: uniqueExcludedPaths.length });
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
      logger.info("Loaded patterns from ignore file", { patternCount: filePatterns.length, ignoreFilePath });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info("Ignore file not found", { ignoreFilePath });
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