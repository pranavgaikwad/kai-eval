import {
  SolutionServerClient,
  FileBasedResponseCache,
  InMemoryCacheWithRevisions,
  KaiModelProvider,
} from "@editor-extensions/agentic";
import { Logger } from "winston";

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
  filterTasksFunc?: FilterTasksFunction;
}

export interface FilteredTask {
  uri: string;
  task: string;
}

export type FilterTasksFunction = (
  taskManeger: TaskManager,
) => Promise<FilteredTask[]>;
