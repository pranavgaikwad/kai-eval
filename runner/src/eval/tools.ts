import { promises as fs } from "fs";
import * as path from "path";

import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { EvaluationToolOptions } from "./types";
import { getMatchingFiles } from "../utils/paths";
import { Task } from "src/taskProviders";

export class EvaluationTools {
  constructor(
    private readonly options: EvaluationToolOptions,
    private readonly workspacePath: string,
    private readonly logger: any,
  ) {}

  getAppArchitectureTool() {
    return tool(
      async () => {
        return this.options.appArchitecture;
      },
      {
        name: "get_app_architecture",
      },
    );
  }

  getListFilesTool() {
    const fileListBefore = this.options.fileList.before;
    const fileListAfter = this.options.fileList.after;

    return tool(
      async ({ pattern, pre_migration = false }) => {
        const targetList = pre_migration ? fileListBefore : fileListAfter;

        if (!pattern || pattern.trim() === "") {
          return targetList.join("\n");
        }

        // Convert simple pattern to regex
        const regexPattern = pattern
          .replace(/\./g, "\\.")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".");

        const regex = new RegExp(regexPattern, "i");
        const matchingFiles = targetList.filter((file) => regex.test(file));

        return matchingFiles.join("\n");
      },
      {
        name: "list_files",
        description:
          "Returns a list of files matching given pattern. If pre_migration is true, returns pre-migration files.",
        schema: z.object({
          pattern: z
            .string()
            .describe(
              "Pattern to match files against (supports wildcards like *.java)",
            ),
          pre_migration: z
            .boolean()
            .default(false)
            .describe("Set to true to return list of files before migration"),
        }),
      },
    );
  }

  getFileContentTool() {
    const changedFiles = this.options.changedFiles;

    return tool(
      async ({ file_path, pre_migration = false }) => {
        const fullPath = path.resolve(this.workspacePath, file_path);

        try {
          if (pre_migration) {
            // Read from disk (workspace has been reset to pre-migration state)
            return await fs.readFile(fullPath, "utf-8");
          } else {
            // For post-migration content, use stored content if file was changed,
            // otherwise read from disk (unchanged files)
            if (changedFiles.has(file_path)) {
              return changedFiles.get(file_path) || "";
            } else {
              return await fs.readFile(fullPath, "utf-8");
            }
          }
        } catch (error) {
          throw new Error(`Failed to read file ${file_path}: ${error}`);
        }
      },
      {
        name: "get_file_content",
        description:
          "Returns the content of a file. If pre_migration is true, returns original content before migration.",
        schema: z.object({
          file_path: z.string().describe("Relative path to the file"),
          pre_migration: z
            .boolean()
            .default(false)
            .describe("Set to true to return pre-migration content"),
        }),
      },
    );
  }

  /**
   * Tool to list files that have been changed after migration
   */
  getListChangedFilesTool() {
    const changedFiles = this.options.changedFiles;

    return tool(
      async () => {
        return Array.from(changedFiles.keys()).join("\n");
      },
      {
        name: "list_changed_files",
        description:
          "Returns the list of files that have been changed after applying the migration fix.",
        schema: z.object({}),
      },
    );
  }

  getAnalysisTasksDiffTool() {
    const analysisBefore = this.options.analysisIssues.before;
    const analysisAfter = this.options.analysisIssues.after;
    const originalRules = this.options.originalRules;

    return tool(
      async () => {
        const beforeIds = new Set(analysisBefore.map((task) => task.getID()));
        const newIssues = analysisAfter.filter(
          (task) => !beforeIds.has(task.getID()),
        );
        const result: Record<
          string,
          {
            uri: string;
            issues: string;
          }[]
        > = {};
        if (newIssues.length) {
          result.newIssuesIdentifiedAfterMigration = groupTasksByUri(newIssues);
        }
        const unresolvedIssues = analysisAfter.filter((task) => {
          return originalRules.some(
            (r) =>
              r.rule === task.getIncident().rule &&
              r.ruleset === task.getIncident().ruleSet,
          );
        });
        if (unresolvedIssues.length) {
          result.unresolvedIssuesAfterMigration =
            groupTasksByUri(unresolvedIssues);
        }
        return JSON.stringify(result, null, 2);
      },
      {
        name: "get_analysis_tasks_diff",
        description:
          "Returns the diff of static analysis tasks before and after migration (resolved, added, remaining).",
        schema: z.object({}),
      },
    );
  }

  getDiagnosticsTasksDiffTool() {
    const diagnosticsBefore = this.options.diagnosticsIssues.before;
    const diagnosticsAfter = this.options.diagnosticsIssues.after;

    return tool(
      async () => {
        const beforeIds = new Set(
          diagnosticsBefore.map((task) => task.getID()),
        );
        const newIssues = diagnosticsAfter.filter(
          (task) => !beforeIds.has(task.getID()),
        );
        return JSON.stringify(
          {
            newIssuesIdentifiedAfterMigration: groupTasksByUri(newIssues),
          },
          null,
          2,
        );
      },
      {
        name: "get_diagnostics_tasks_diff",
        description:
          "Returns the diff of diagnostics tasks before and after migration (resolved, added, remaining).",
        schema: z.object({}),
      },
    );
  }

  getAllTools() {
    return [
      this.getAppArchitectureTool(),
      this.getListFilesTool(),
      this.getFileContentTool(),
      this.getListChangedFilesTool(),
      this.getAnalysisTasksDiffTool(),
      this.getDiagnosticsTasksDiffTool(),
    ];
  }
}

function groupTasksByUri(tasks: Task[]): {
  uri: string;
  issues: string;
}[] {
  const groupedByUri: Record<string, Set<string>> = {};
  for (const task of tasks) {
    const uri = task.getUri();
    if (!groupedByUri[uri]) {
      groupedByUri[uri] = new Set();
    }
    groupedByUri[uri].add(task.toString());
  }
  return Object.entries(groupedByUri).map(([uri, issuesSet]) => {
    return {
      uri,
      issues: Array.from(issuesSet).join("\n"),
    };
  });
}
