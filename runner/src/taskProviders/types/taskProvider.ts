export interface TaskFactory<TData, TTask extends Task> {
  createTask(data: TData, uri: string): TTask;
}

export interface Task {
  toString(): string;
  toJSON(): Record<string, string|number|boolean|undefined>;
  getID(): string;
  getUri(): string;
}

export interface BaseInitParams {
  workspacePaths: string[];
}

export interface TaskProvider<TInitParams extends BaseInitParams = BaseInitParams, TInitResult = unknown> {
  init(params: TInitParams): Promise<TInitResult>;
  isInitialized(): boolean;
  getCurrentTasks(): Promise<Task[]>;
  stop(): Promise<void>;
}
