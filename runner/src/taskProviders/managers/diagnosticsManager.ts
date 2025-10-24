import { Logger } from "winston";

import { Diagnostic, PublishDiagnosticsParams } from "./lsp";
import { Task } from "../types";

class DiagnosticTask implements Task {
  constructor(private readonly d: Diagnostic) {}

  getID(): string {
    return `${this.d.uri}:${this.d.message}:${this.d.severity}:${this.d.source}:${this.d.code?.toString() ?? ""}`;
  }

  toJSON(): Record<string, string|number|boolean|undefined> {
    return {
      id: this.getID(),
      type: this.mapDiagnosticSeverity(this.d.severity),
      category: "diagnostic",
      description: this.d.message,
      file: this.getUri(),
      line: this.d.range.start.line + 1, // Convert to 1-based
      column: this.d.range.start.character + 1, // Convert to 1-based
      rule: this.d.code?.toString(),
      source: this.d.source || "lsp",
    };
  }

  toString(): string {
    return JSON.stringify(this.toJSON());
  }

  getUri(): string {
    return this.d.uri ? this.uriToPath(this.d.uri) : "";
  }

  private mapDiagnosticSeverity(severity?: number): string {
    switch (severity) {
      case 1: // DiagnosticSeverity.Error
        return "error";
      case 2: // DiagnosticSeverity.Warning
        return "warning";
      case 3: // DiagnosticSeverity.Information
        return "info";
      case 4: // DiagnosticSeverity.Hint
        return "hint";
      default:
        return "info";
    }
  }

  private uriToPath(uri: string): string {
    if (uri.startsWith("file://")) {
      return decodeURIComponent(uri.substring(7));
    }
    return uri;
  }
}

export class DiagnosticsManager {
  private readonly diagnosticsMap = new Map<string, Diagnostic[]>();

  constructor(private readonly logger: Logger) {
    this.logger = logger.child({ module: 'DiagnosticsManager' });
  }

  updateDiagnostics(params: PublishDiagnosticsParams): void {
    this.logger.info("Received diagnostics", {
      uri: params.uri,
      issueCount: params.diagnostics.length
    });

    if (params.diagnostics.length === 0) {
      this.diagnosticsMap.delete(params.uri);
    } else {
      this.diagnosticsMap.set(params.uri, params.diagnostics);
    }
  }

  getAllTasks(): Task[] {
    const tasks: Task[] = [];

    for (const [uri, diagnostics] of this.diagnosticsMap) {
      for (const diagnostic of diagnostics) {
        const diagnosticWithUri = { ...diagnostic, uri };
        tasks.push(new DiagnosticTask(diagnosticWithUri));
      }
    }

    return tasks;
  }

  getTasksForFile(uri: string): Task[] {
    const diagnostics = this.diagnosticsMap.get(uri) || [];
    return diagnostics.map((d) => new DiagnosticTask({ ...d, uri }));
  }

  clearAllDiagnostics(): void {
    this.diagnosticsMap.clear();
  }

  getDiagnosticsCount(): number {
    let count = 0;
    for (const diagnostics of this.diagnosticsMap.values()) {
      count += diagnostics.length;
    }
    return count;
  }

  getFilesWithDiagnostics(): string[] {
    return Array.from(this.diagnosticsMap.keys());
  }
}