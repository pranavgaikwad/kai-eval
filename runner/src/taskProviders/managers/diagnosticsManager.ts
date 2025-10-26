import { Logger } from "winston";

import { Task, TaskFactory } from "../types/taskProvider";

export class TasksStoreManager<TData, TTask extends Task> {
  private readonly dataMap = new Map<string, TData[]>();

  constructor(
    private readonly logger: Logger,
    private readonly taskFactory: TaskFactory<TData, TTask>,
    private readonly moduleName: string = 'TasksStoreManager'
  ) {
    this.logger = logger.child({ module: moduleName });
  }

  updateData(uri: string, data: TData[]): void {
    this.logger.silly("Updating store with diagnostics data", {
      uri,
      itemCount: data.length
    });

    if (data.length === 0) {
      this.dataMap.delete(uri);
    } else {
      this.dataMap.set(uri, data);
    }
  }

  getAllTasks(): TTask[] {
    const tasks: TTask[] = [];

    for (const [uri, dataItems] of this.dataMap) {
      for (const dataItem of dataItems) {
        tasks.push(this.taskFactory.createTask(dataItem, uri));
      }
    }

    return tasks;
  }

  getTasksForFile(uri: string): TTask[] {
    const dataItems = this.dataMap.get(uri) || [];
    return dataItems.map((item) => this.taskFactory.createTask(item, uri));
  }

  clearAllData(): void {
    this.dataMap.clear();
  }

  getDataCount(): number {
    let count = 0;
    for (const dataItems of this.dataMap.values()) {
      count += dataItems.length;
    }
    return count;
  }

  getFilesWithData(): string[] {
    return Array.from(this.dataMap.keys());
  }
}
