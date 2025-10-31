import {
  type SolutionServerClient,
  type FileBasedResponseCache,
  type InMemoryCacheWithRevisions,
  type KaiModelProvider,
} from "@editor-extensions/agentic";
import type { Logger } from "winston";

import { type TaskManager } from "../taskManager";

export type SupportedModelProviders =
  | "AzureChatOpenAI"
  | "ChatBedrock"
  | "ChatDeepSeek"
  | "ChatGoogleGenerativeAI"
  | "ChatOllama"
  | "ChatOpenAI";

export interface KaiWorkflowManagerOptions {
  logger: Logger;
  workspaceDir: string;
  modelProvider: KaiModelProvider;
  solutionServerClient: SolutionServerClient;
  fsCache: InMemoryCacheWithRevisions<string, string>;
  toolCache: FileBasedResponseCache<Record<string, unknown>, string>;
  filterTasksFunc?: TasksInteractionResolver;
}

export interface FilteredTask {
  uri: string;
  task: string;
}

export type TasksInteractionResolver = (
  taskManeger: TaskManager,
) => Promise<FilteredTask[]>;
