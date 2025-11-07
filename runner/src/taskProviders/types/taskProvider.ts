export interface TaskFactory<TData, TTask extends Task> {
  createTask(data: TData, uri: string): TTask;
}

export interface Task {
  toString(): string;
  toJSON(): Record<string, string | number | boolean | undefined>;
  getID(): string;
  getUri(): string;
}

export interface BaseInitParams {
  workspacePaths: string[];
}

export interface VersionedTasks {
  generationId: number;
  tasks: Task[];
}

export interface TaskProvider<
  TInitParams extends BaseInitParams = BaseInitParams,
  TInitResult = unknown,
> {
  name: string;
  init(params: TInitParams): Promise<TInitResult>;
  isInitialized(): boolean;
  getCurrentTasks(): Promise<VersionedTasks>;
  stop(): Promise<void>;
  reset(): void;
}
