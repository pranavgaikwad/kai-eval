import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

import {
  KaiInteractiveWorkflow,
  KaiInteractiveWorkflowInput,
  KaiWorkflowMessage,
  KaiWorkflowMessageType,
  KaiWorkflowInitOptions,
  KaiModelProvider,
  SolutionServerClient,
  InMemoryCacheWithRevisions,
  FileBasedResponseCache,
  KaiUserInteraction,
  KaiModifiedFile,
  KaiUserInteractionMessage,
} from "@editor-extensions/agentic";
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { Logger } from "winston";

import { TaskManager } from "../taskManager/taskManager";
import { getFilteredTasks } from "../utils/tasks";


export interface KaiWorkflowManagerOptions {
  logger: Logger;
  workspaceDir: string;
  modelProvider: KaiModelProvider;
  solutionServerClient: SolutionServerClient;
  fsCache: InMemoryCacheWithRevisions<string, string>;
  toolCache: FileBasedResponseCache<Record<string, unknown>, string>;
}

export class KaiWorkflowManager {
  private workflow: KaiInteractiveWorkflow;
  private isInitialized: boolean = false;
  private pendingInteractions: Map<string, (response: unknown) => void> = new Map();
  private workspaceDir: string = "";

  // stream buffer
  private readonly defaultBuffer: AIMessageChunk = new AIMessageChunk({
    content: "",
    id: "<unknown>",
  });
  private buffer: AIMessageChunk = this.defaultBuffer;
  private traceDir: string;

  constructor(
    private readonly logger: Logger,
    private readonly taskManager: TaskManager,
    private readonly logDir: string = path.join(os.tmpdir(), `kai-workflow-trace-${Date.now()}`)
  ) {
    this.logger = logger.child({ module: "KaiWorkflowManager" });
    this.workflow = new KaiInteractiveWorkflow(this.logger);
    this.traceDir = path.join(logDir, "traces");
  }

  async init(options: KaiWorkflowManagerOptions): Promise<void> {
    try {
      await fs.mkdir(this.traceDir, { recursive: true });
      this.logger.info("Using trace directory", { traceDir: this.traceDir });

      const initOptions: KaiWorkflowInitOptions = {
        modelProvider: options.modelProvider,
        workspaceDir: options.workspaceDir,
        fsCache: options.fsCache,
        solutionServerClient: options.solutionServerClient,
        toolCache: options.toolCache,
      };

      this.workspaceDir = options.workspaceDir;
      await this.workflow.init(initOptions);
      this.setupEventHandlers();
      this.isInitialized = true;
      this.logger.info("Kai workflow initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Kai workflow", { error });
      throw error;
    }
  }

  getWorkflow(): KaiInteractiveWorkflow {
    return this.workflow;
  }

  async executeWorkflow(input: KaiInteractiveWorkflowInput): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("Workflow not initialized. Call init() first.");
    }

    try {
      this.logger.info("Starting workflow execution", {
        programmingLanguage: input.programmingLanguage,
        migrationHint: input.migrationHint,
        enableAgentMode: input.enableAgentMode,
        incidentCount: input.incidents?.length || 0
      });

      await this.workflow.run(input);

      this.logger.info("Workflow execution completed");
    } catch (error) {
      this.logger.error("Workflow execution failed", { error });
      throw error;
    }
  }

  cleanup(): void {
    this.workflow.removeAllListeners();
    this.pendingInteractions.clear();
    this.logger.info("Kai workflow manager cleaned up", { traceDir: this.traceDir });
  }

  private setupEventHandlers(): void {
    this.workflow.removeAllListeners();

    this.workflow.on("workflowMessage", (message: KaiWorkflowMessage) => {
      this.handleWorkflowMessage(message);
    });
  }

  private async handleWorkflowMessage(message: KaiWorkflowMessage): Promise<void> {
    switch (message.type) {
      case KaiWorkflowMessageType.LLMResponseChunk: {
        const chunk = message.data;
        if (this.buffer === this.defaultBuffer) {
          this.buffer = chunk;
        } else if (this.buffer.id === chunk.id) {
          this.buffer = this.buffer.concat(chunk);
        } else {
          await this.writeMessageToTrace(this.buffer);
          this.buffer = chunk;
        }
        break;
      }
      case KaiWorkflowMessageType.LLMResponse:
        await this.writeMessageToTrace(message.data as AIMessage);
        break;
      case KaiWorkflowMessageType.ModifiedFile:
        this.handleModifiedFile(message);
        break;
      case KaiWorkflowMessageType.UserInteraction:
        this.handleUserInteraction(message);
        break;
      case KaiWorkflowMessageType.Error:
        this.logger.error("Workflow error message", {
          messageId: message.id,
          error: message.data
        });
        break;
      default:
        this.logger.warn("Unknown workflow message type", { message });
        break;
    }
  }

  private handleModifiedFile(message: KaiWorkflowMessage): void {
    if (message.type === KaiWorkflowMessageType.ModifiedFile) {
      const modifiedFile = message.data as KaiModifiedFile;
      this.logger.info("File modified by workflow", {
        messageId: message.id,
        path: modifiedFile.path,
        contentLength: modifiedFile.content.length,
        hasUserInteraction: !!modifiedFile.userInteraction
      });
      this.applyFileChanges(modifiedFile, message.id).catch((error) => {
        this.logger.error("Failed to apply file changes", {
          messageId: message.id,
          path: modifiedFile.path,
          error
        });
      });
    }
  }

  private handleUserInteraction(message: KaiWorkflowMessage): void {
    if (message.type === KaiWorkflowMessageType.UserInteraction) {
      const interaction = message.data as KaiUserInteraction;
      this.logger.info("User interaction required", {
        messageId: message.id,
        interactionType: interaction.type,
        systemMessage: interaction.systemMessage
      });

      this.autoRespondToUserInteraction(message, message).catch((error) => {
        this.logger.error("Failed to handle user interaction", { messageId: message.id, error });
      });
    }
  }

  private async applyFileChanges(modifiedFile: KaiModifiedFile, messageId: string): Promise<void> {
    try {
      const resolvedPath = this.resolveFilePath(modifiedFile.path);
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fs.writeFile(resolvedPath, modifiedFile.content, 'utf-8');
      this.logger.info("Successfully applied file changes", {
        messageId,
        originalPath: modifiedFile.path,
        resolvedPath,
        contentLength: modifiedFile.content.length
      });
    } catch (error) {
      this.logger.error("Failed to write modified file", {
        messageId,
        path: modifiedFile.path,
        error
      });
      throw error;
    }
  }

  private resolveFilePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    const resolvedPath = path.resolve(this.workspaceDir, filePath);
    return resolvedPath;
  }

  private async writeMessageToTrace(message: AIMessage): Promise<void> {
    try {
      const filepath = path.join(this.traceDir, `llm_responses.txt`);
      await fs.appendFile(filepath, `${JSON.stringify(message.toJSON(), null, 2)}\n`);
    } catch (error) {
      this.logger.warn("Failed to write message trace", { error, messageId: message.id });
    }
  }

  private async autoRespondToUserInteraction(message: KaiWorkflowMessage, msg: KaiUserInteractionMessage): Promise<void> {
    const { data: interaction } = msg;
    switch (interaction.type) {
      case "yesNo":
        interaction.response = {
          ...interaction.response,
          yesNo: true, // always accept next steps
        };
        break;
      case "choice":
        interaction.response = {
          ...interaction.response,
          yesNo: true,
          choice: 0, // always select the first option
        };
        break;
      case "tasks":
        try {
          const filteredTasks = await getFilteredTasks(this.taskManager, 3);
          this.logger.info("Filtered tasks for user interaction", {
            messageId: message.id,
            taskCount: filteredTasks.length
          });

          interaction.response = {
            ...interaction.response,
            yesNo: true,
            tasks: filteredTasks
          };
        } catch (error) {
          this.logger.error("Failed to get filtered tasks", { messageId: message.id, error });
          interaction.response = { yesNo: false };
        }
        break;
      default:
        this.logger.warn("Unknown interaction type, defaulting to no", { type: interaction.type });
        interaction.response = { yesNo: false };
    }
    msg.data = interaction;

    await this.workflow.resolveUserInteraction(msg);
  }
}