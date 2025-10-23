import { Logger } from "winston";

export interface Task {
  toString(): string;
  toJSON(): Record<string, any>;
  getID(): string;
}

export interface BaseInitParams {
  workspacePaths: string[];
}

export interface TaskProvider<TInitParams extends BaseInitParams = BaseInitParams, TInitResult = any> {
  init(params: TInitParams): Promise<TInitResult>;
  isInitialized(): boolean;
  getCurrentTasks(): Promise<Task[]>;
  stop(): Promise<void>;
}
