import * as crypto from "crypto";

import { Task, TaskFactory, AnalysisIncident, Diagnostic } from "./types";
import { fileUriToPath } from "../utils/paths";

export class DiagnosticTask implements Task {
  constructor(private readonly diagnostic: Diagnostic & { uri: string }) {}

  getID(): string {
    return `${this.diagnostic.uri}:${this.diagnostic.message}:${this.diagnostic.severity}:${this.diagnostic.source}:${this.diagnostic.code?.toString() ?? ""}`;
  }

  toJSON(): Record<string, string | number | boolean | undefined> {
    return {
      id: this.getID(),
      type: this.mapDiagnosticSeverity(this.diagnostic.severity),
      category: "diagnostic",
      description: this.diagnostic.message,
      file: this.getUri(),
      line: this.diagnostic.range.start.line + 1, // Convert to 1-based
      column: this.diagnostic.range.start.character + 1, // Convert to 1-based
      rule: this.diagnostic.code?.toString(),
      source: this.diagnostic.source || "lsp",
    };
  }

  toString(): string {
    return this.diagnostic.message;
  }

  getUri(): string {
    return this.diagnostic.uri ? this.uriToPath(this.diagnostic.uri) : "";
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

export class DiagnosticTaskFactory
  implements TaskFactory<Diagnostic, DiagnosticTask>
{
  createTask(diagnostic: Diagnostic, uri: string): DiagnosticTask {
    return new DiagnosticTask({ ...diagnostic, uri });
  }
}

export class AnalysisTaskFactory
  implements TaskFactory<AnalysisIncident, AnalysisTask>
{
  createTask(incident: AnalysisIncident, _uri: string): AnalysisTask {
    return new AnalysisTask(incident);
  }
}

export class AnalysisTask implements Task {
  constructor(private readonly incident: AnalysisIncident) {}

  getID(): string {
    const data = `${this.incident.uri}:${this.incident.ruleSet}:${this.incident.rule}:${this.incident.category}:${this.incident.message}:${this.incident.lineNumber || 0}`;
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  getUri(): string {
    return fileUriToPath(this.incident.uri);
  }

  toString(): string {
    return `${this.incident.description} - ${this.incident.message}`;
  }

  toJSON(): Record<string, string | number | boolean | undefined> {
    return {
      id: this.getID(),
      type: "analysis",
      category: this.incident.category,
      description: this.incident.description,
      message: this.incident.message,
      file: this.getUri(),
      line: this.incident.lineNumber,
      column: this.incident.column,
      rule: this.incident.rule,
      ruleset: this.incident.ruleSet,
      source: "konveyor",
      effort: this.incident.effort,
      links: this.incident.links?.join(","),
    };
  }

  getIncident(): AnalysisIncident {
    return this.incident;
  }
}
