import * as net from "net";
import { Logger } from "winston";

import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  MessageConnection,
} from "vscode-jsonrpc/node";

import {
  InitializeParams,
  InitializeResult,
  InitializeRequest,
  InitializedNotification,
  PublishDiagnosticsNotification,
  PublishDiagnosticsParams,
} from "./lsp";

export class LSPConnectionManager {
  private connection?: MessageConnection;

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

  async disconnect(): Promise<void> {
    if (this.connection) {
      this.connection.dispose();
      this.connection = undefined;
    }
  }
}