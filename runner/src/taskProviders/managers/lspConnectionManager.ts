import * as net from "net";

import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  MessageConnection,
} from "vscode-jsonrpc/node";
import { Logger } from "winston";


import {
  InitializeParams,
  InitializeResult,
  InitializeRequest,
  InitializedNotification,
  PublishDiagnosticsNotification,
  PublishDiagnosticsParams,
  DidChangeTextDocumentNotification,
  DidChangeTextDocumentParams,
  DidOpenTextDocumentNotification,
  DidOpenTextDocumentParams,
} from "./lsp";

export class LSPConnectionManager {
  private connection?: MessageConnection;
  private documentVersions = new Map<string, number>();
  private openedDocuments = new Set<string>();

  constructor(private readonly logger: Logger) {
    this.logger = logger.child({ module: 'LSPConnectionManager' });
  }

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
    requestType: any,
    params: TParams
  ): Promise<TResult> {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }

    return await this.connection.sendRequest(requestType, params);
  }

  async sendNotification<TParams>(
    notificationType: any,
    params: TParams
  ): Promise<void> {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }

    await this.connection.sendNotification(notificationType, params);
  }

  isConnected(): boolean {
    return this.connection !== undefined;
  }


  async notifyFileChange(filePath: string, fileContent: string, languageId: string = "java"): Promise<void> {
    if (!this.connection) {
      throw new Error("Not connected to LSP server");
    }

    const uri = this.pathToUri(filePath);

    // Open the document first if it hasn't been opened
    if (!this.openedDocuments.has(uri)) {
      await this.openDocument(uri, fileContent, languageId);
      return; // Opening the document will already send the content
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
        }
      ]
    };

    await this.sendNotification(DidChangeTextDocumentNotification, params);
    this.logger.debug("Notified LSP server of file change", { uri, version: newVersion });
  }

  private async openDocument(uri: string, fileContent: string, languageId: string): Promise<void> {
    const version = 1;
    this.documentVersions.set(uri, version);
    this.openedDocuments.add(uri);

    const params: DidOpenTextDocumentParams = {
      textDocument: {
        uri,
        languageId,
        version,
        text: fileContent,
      }
    };

    await this.sendNotification(DidOpenTextDocumentNotification, params);
    this.logger.debug("Opened document in LSP server", { uri, languageId, version });
  }

  private pathToUri(filePath: string): string {
    const normalizedPath = filePath.replace(/\\/g, "/");
    if (normalizedPath.startsWith("/")) {
      return `file://${normalizedPath}`;
    } else {
      return `file:///${normalizedPath}`;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.dispose();
      this.connection = undefined;
    }
  }
}