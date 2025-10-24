import { Logger } from "winston";

import { Diagnostic, PublishDiagnosticsParams } from "./lsp";
import { Task } from "../types";

export class DiagnosticTask implements Task {
  constructor(private readonly diagnostic: Diagnostic) {}

  getID(): string {
    const uri = this.diagnostic.uri || "";
    const line = this.diagnostic.range.start.line;
    const char = this.diagnostic.range.start.character;
    return `${uri}:${line}:${char}`;
  }

  toJSON(): Record<string, any> {
    return {
      id: this.getID(),
      type: this.mapDiagnosticSeverity(this.diagnostic.severity),
      category: "diagnostic",
      description: this.diagnostic.message,
      file: this.diagnostic.uri ? this.uriToPath(this.diagnostic.uri) : "",
      line: this.diagnostic.range.start.line + 1, // Convert to 1-based
      column: this.diagnostic.range.start.character + 1, // Convert to 1-based
      rule: this.diagnostic.code?.toString(),
      source: this.diagnostic.source || "lsp",
    };
  }

  toString(): string {
    return JSON.stringify(this.toJSON());
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
      // Clear diagnostics for this file
      this.diagnosticsMap.delete(params.uri);
    } else {
      // Update diagnostics for this file
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