import * as net from "net";

import {
  type MessageConnection,
  type NotificationType,
  type RequestType,
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";
import type { Logger } from "winston";

import { pathToUri } from "../../utils/paths";
import {
  type InitializeParams,
  type InitializeResult,
  type PublishDiagnosticsParams,
  type DidChangeTextDocumentParams,
  type DidOpenTextDocumentParams,
  type DidCloseTextDocumentParams,
  type DidSaveTextDocumentParams,
  type DidChangeWatchedFilesParams,
  type FileEvent,
  InitializeRequest,
  InitializedNotification,
  PublishDiagnosticsNotification,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DidCloseTextDocumentNotification,
  DidSaveTextDocumentNotification,
  DidChangeWatchedFilesNotification,
} from "../types/lsp";

/**
 * RPC client connection manager with some lsp specific helpers
 */
export class RPCConnectionManager {
  private connection?: MessageConnection;
  private documentVersions = new Map<string, number>();
  private openedDocuments = new Set<string>();

  constructor(private readonly logger: Logger) {}

  async connectToPipe(pipeName: string): Promise<MessageConnection> {
    const socket = net.createConnection(pipeName);

    await new Promise<void>((resolve, reject) => {
      socket.on("connect", resolve);
      socket.on("error", reject);
      socket.setTimeout(10000, () => {
        reject(new Error("Timeout connecting to LSP pipe"));
      });
    });

    const reader = new StreamMessageReader(socket);
    const writer = new StreamMessageWriter(socket);
    this.connection = createMessageConnection(reader, writer);

    this.connection.listen();
    return this.connection;
  }

  async sendInitialize(params: InitializeParams): Promise<InitializeResult> {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }

    const result = await this.connection.sendRequest(InitializeRequest, params);
    await this.connection.sendNotification(InitializedNotification, {});
    return result;
  }

  onDiagnostics(handler: (params: PublishDiagnosticsParams) => void): void {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }
    this.connection.onNotification(PublishDiagnosticsNotification, handler);
  }

  async sendRequest<TParams, TResult>(
    requestType: RequestType<TParams, TResult, Error>,
    params: TParams,
  ): Promise<TResult> {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }
    return await this.connection.sendRequest(requestType, params);
  }

  async sendNotification<TParams>(
    notificationType: NotificationType<TParams>,
    params: TParams,
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }
    await this.connection.sendNotification(notificationType, params);
  }

  onRequest<TParams, TResult>(
    requestType: RequestType<TParams, TResult, Error>,
    handler: (params: TParams) => Promise<TResult> | TResult,
  ): void {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }
    this.connection.onRequest(requestType, handler);
  }

  isConnected(): boolean {
    return this.connection !== undefined;
  }

  async openTextDocument(
    filePath: string,
    fileContent: string,
    languageId: string = "java",
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }

    const uri = pathToUri(filePath);

    if (this.openedDocuments.has(uri)) {
      this.logger.debug("Document already opened, skipping open notification", {
        uri,
      });
      return;
    }

    const version = 1;
    this.documentVersions.set(uri, version);
    this.openedDocuments.add(uri);

    const params: DidOpenTextDocumentParams = {
      textDocument: {
        uri,
        languageId,
        version,
        text: fileContent,
      },
    };

    await this.sendNotification(DidOpenTextDocumentNotification, params);
    this.logger.silly("Opened document in LSP server", {
      uri,
      languageId,
      version,
    });
  }

  async changeTextDocument(
    filePath: string,
    fileContent: string,
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }

    const uri = pathToUri(filePath);

    if (!this.openedDocuments.has(uri)) {
      this.logger.debug(
        "Document not opened, cannot send change notification",
        { uri },
      );
      return;
    }

    const currentVersion = this.documentVersions.get(uri) || 0;
    const newVersion = currentVersion + 1;
    this.documentVersions.set(uri, newVersion);

    const params: DidChangeTextDocumentParams = {
      textDocument: {
        uri,
        version: newVersion,
      },
      contentChanges: [
        {
          text: fileContent,
        },
      ],
    };

    this.logger.silly("Notifying LSP server of document change", {
      uri,
      version: newVersion,
    });
    await this.sendNotification(DidChangeTextDocumentNotification, params);
    this.logger.silly("Notified LSP server of document change", {
      uri,
      version: newVersion,
    });
  }

  async closeTextDocument(filePath: string): Promise<void> {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }

    const uri = pathToUri(filePath);

    if (!this.openedDocuments.has(uri)) {
      this.logger.debug("Document not opened, skipping close notification", {
        uri,
      });
      return;
    }

    const params: DidCloseTextDocumentParams = {
      textDocument: { uri },
    };

    this.logger.silly("Notifying LSP server of document close", { uri });
    await this.sendNotification(DidCloseTextDocumentNotification, params);
    this.logger.silly("Notified LSP server of document close", { uri });

    this.openedDocuments.delete(uri);
    this.documentVersions.delete(uri);
  }

  async saveTextDocument(
    filePath: string,
    fileContent?: string,
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }

    const uri = pathToUri(filePath);

    if (!this.openedDocuments.has(uri)) {
      this.logger.debug("Document not opened, cannot send save notification", {
        uri,
      });
      return;
    }

    const params: DidSaveTextDocumentParams = {
      textDocument: { uri },
      text: fileContent,
    };

    this.logger.silly("Notifying LSP server of document save", { uri });
    await this.sendNotification(DidSaveTextDocumentNotification, params);
    this.logger.silly("Notified LSP server of document save", { uri });
  }

  async notifyFileChanges(fileEvents: FileEvent[]): Promise<void> {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }

    if (fileEvents.length === 0) {
      return;
    }

    const params: DidChangeWatchedFilesParams = {
      changes: fileEvents,
    };

    this.logger.silly("Notifying LSP server of file changes", {
      changeCount: fileEvents.length,
      changes: fileEvents,
    });
    await this.sendNotification(DidChangeWatchedFilesNotification, params);
    this.logger.silly("Notified LSP server of file changes", {
      changeCount: fileEvents.length,
    });
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.dispose();
      this.connection = undefined;
    }
  }
}
