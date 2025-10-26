import { Logger } from "winston";

import { TaskSnapshot, TaskSnapshotDiff } from "./types";
import { TaskProvider, Task } from "../taskProviders/types/taskProvider";

export class TaskManager {
  private providers: TaskProvider[] = [];
  private readonly snapshots: Map<number, TaskSnapshot> = new Map();
  private snapshotCounter: number = 0;

  constructor(
    private readonly logger: Logger,
    provider?: TaskProvider[]
  ) {
    if (provider) {
      this.providers = [...provider];
    }
  }

  async getTasks(): Promise<TaskSnapshotDiff> {
    const snapshotId = this.generateSnapshotId();
    const tasks = await Promise.all(
      this.providers.map((provider) => provider.getCurrentTasks()),
    );
    this.snapshots.set(snapshotId, {
      id: snapshotId,
      timestamp: new Date(),
      tasks: new Map<string, Task>(
        tasks.flat().map((task) => [task.getID(), task]),
      ),
    });
    return this.compareSnapshots(snapshotId - 1, snapshotId);
  }

  getTaskFrequency(snapshotId: number, taskId: string): number {
    if (!this.snapshots.has(snapshotId)) {
      throw new Error("Snapshot not found");
    }

    let count = 0;
    for (let i = 1; i <= snapshotId; i++) {
      const snapshot = this.snapshots.get(i);
      if (snapshot && snapshot.tasks.has(taskId)) {
        count++;
      }
    }

    return count;
  }

  compareSnapshots(
    olderSnapshotId: number,
    newerSnapshotId: number,
  ): TaskSnapshotDiff {
    const olderSnapshot = this.snapshots.get(olderSnapshotId);
    const newerSnapshot = this.snapshots.get(newerSnapshotId);

    if (!olderSnapshot || !newerSnapshot) {
      throw new Error("Snapshot not found");
    }

    const resolved: Task[] = [];
    const added: Task[] = [];
    const unresolved: Task[] = [];

    for (const [taskId, task] of olderSnapshot.tasks) {
      if (newerSnapshot.tasks.has(taskId)) {
        unresolved.push(task);
      } else {
        resolved.push(task);
      }
    }

    for (const [taskId, task] of newerSnapshot.tasks) {
      if (!olderSnapshot.tasks.has(taskId)) {
        added.push(task);
      }
    }

    return { resolved, added, unresolved };
  }

  public getLatestSnapshotId(): number {
    return this.snapshotCounter;
  }

  private generateSnapshotId(): number {
    return ++this.snapshotCounter;
  }
}
