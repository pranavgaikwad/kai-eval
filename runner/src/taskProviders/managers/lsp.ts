import { RequestType, NotificationType } from "vscode-jsonrpc/node";

export interface InitializeParams {
  rootUri: string;
  capabilities: ClientCapabilities;
  extendedClientCapabilities?: Record<string, any>;
  initializationOptions?: Record<string, any>;
}

export interface ClientCapabilities {
  workspace?: {
    workspaceFolders?: boolean;
    didChangeWatchedFiles?: {
      dynamicRegistration?: boolean;
    };
  };
  textDocument?: {
    publishDiagnostics?: {
      relatedInformation?: boolean;
      versionSupport?: boolean;
      tagSupport?: {
        valueSet: number[];
      };
    };
  };
}

export interface InitializeResult {
  capabilities: ServerCapabilities;
}

export interface ServerCapabilities {}

export interface InitializedParams {}

export interface Diagnostic {
  uri?: string;
  range: Range;
  severity?: DiagnosticSeverity;
  code?: number | string;
  codeDescription?: CodeDescription;
  source?: string;
  message: string;
  tags?: DiagnosticTag[];
  relatedInformation?: DiagnosticRelatedInformation[];
  data?: any;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  character: number;
}

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export enum DiagnosticTag {
  Unnecessary = 1,
  Deprecated = 2,
}

export interface CodeDescription {
  href: string;
}

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: Diagnostic[];
}

export const InitializeRequest = new RequestType<
  InitializeParams,
  InitializeResult,
  void
>("initialize");

export const InitializedNotification = new NotificationType<InitializedParams>(
  "initialized",
);

export const PublishDiagnosticsNotification =
  new NotificationType<PublishDiagnosticsParams>(
    "textDocument/publishDiagnostics",
  );

export interface TextDocumentIdentifier {
  uri: string;
}

export interface DidChangeTextDocumentParams {
  textDocument: VersionedTextDocumentIdentifier;
  contentChanges: TextDocumentContentChangeEvent[];
}

export interface VersionedTextDocumentIdentifier extends TextDocumentIdentifier {
  version: number;
}

export interface TextDocumentContentChangeEvent {
  text: string;
}

export const DidChangeTextDocumentNotification = new NotificationType<DidChangeTextDocumentParams>(
  "textDocument/didChange",
);

export interface DidOpenTextDocumentParams {
  textDocument: TextDocumentItem;
}

export interface TextDocumentItem {
  uri: string;
  languageId: string;
  version: number;
  text: string;
}

export const DidOpenTextDocumentNotification = new NotificationType<DidOpenTextDocumentParams>(
  "textDocument/didOpen",
);


// Utility functions for LSP operations
export function mapDiagnosticSeverity(severity?: DiagnosticSeverity): string {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return "error";
    case DiagnosticSeverity.Warning:
      return "warning";
    case DiagnosticSeverity.Information:
      return "info";
    case DiagnosticSeverity.Hint:
      return "hint";
    default:
      return "info";
  }
}

export function uriToPath(uri: string): string {
  if (uri.startsWith("file://")) {
    return decodeURIComponent(uri.substring(7));
  }
  return uri;
}

export function pathToUri(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");
  if (normalizedPath.startsWith("/")) {
    return `file://${normalizedPath}`;
  } else {
    return `file:///${normalizedPath}`;
  }
}