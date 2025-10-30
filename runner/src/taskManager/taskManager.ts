import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

import { type Logger } from "winston";

import type { TaskSnapshotDiff, TaskSnapshot } from "./types";
import { type TaskProvider, type Task } from "../taskProviders";

export class TaskManager {
  private providers: TaskProvider[] = [];
  private readonly snapshots: Map<number, TaskSnapshot> = new Map();
  // store tasks by providers and their generations
  private readonly tasksStore: Map<string, Map<number, Task[]>> = new Map();
  private snapshotCounter: number = 0;

  constructor(
    private readonly logger: Logger,
    provider?: TaskProvider[],
    private readonly snapshotDir: string = "",
    private readonly storeSnapshots: boolean = false,
  ) {
    if (provider) {
      this.providers = [...provider];
    }
    this.logger = logger.child({ module: "TaskManager" });

    if (this.storeSnapshots) {
      this.snapshotDir = path.join(snapshotDir || os.tmpdir(), "snapshots");
      fs.mkdir(this.snapshotDir, { recursive: true })
        .then(() => {
          this.logger.info("Storing snapshots", {
            snapshotDir: this.snapshotDir,
          });
        })
        .catch((error) => {
          throw new Error(`Failed to create snapshot directory: ${error}`);
        });
    }
  }

  async getTasks(): Promise<number> {
    const snapshotId = this.generateSnapshotId();
    const providerResults = await Promise.all(
      this.providers.map(async (provider) => {
        const versionedTasks = await provider.getCurrentTasks();
        return {
          providerName: provider.name,
          versionedTasks,
        };
      }),
    );

    const providerGenerationIDs = new Map<string, number>();
    let totalTasks = 0;
    let newTasksStored = 0;
    for (const { providerName, versionedTasks } of providerResults) {
      const currGenId = versionedTasks.generationId;
      providerGenerationIDs.set(providerName, currGenId);
      const storedTasks =
        this.tasksStore.get(providerName) || new Map<number, Task[]>();
      if (!storedTasks.has(currGenId)) {
        storedTasks.set(currGenId, versionedTasks.tasks);
        newTasksStored += versionedTasks.tasks.length;
        this.tasksStore.set(providerName, storedTasks);
      }
      totalTasks += versionedTasks.tasks.length;
      this.logger.silly("Processed tasks for provider", {
        providerName,
        generationId: currGenId,
        tasksCount: versionedTasks.tasks.length,
      });
    }

    const snapshot: TaskSnapshot = {
      id: snapshotId,
      timestamp: new Date(),
      providerGenerationIDs,
    };

    this.logger.debug("Setting tasks snapshot", {
      providerCount: providerGenerationIDs.size,
      totalTasks,
      newTasksStored,
      snapshotId,
      providerGenerationIDs: Array.from(providerGenerationIDs.entries()).map(
        ([providerName, generationId]) => ({
          providerName,
          generationId,
        }),
      ),
    });

    if (this.storeSnapshots) {
      const tasks = Array.from(providerGenerationIDs.entries())
        .flatMap(([providerName, generationId]) => {
          const tasksForGen =
            this.tasksStore.get(providerName)?.get(generationId) || [];
          return tasksForGen.map((task) => task.toJSON());
        })
        .filter(Boolean);
      await fs.writeFile(
        path.join(this.snapshotDir, `${snapshotId}.json`),
        JSON.stringify(
          {
            id: snapshot.id,
            timestamp: snapshot.timestamp,
            tasks,
          },
          null,
          2,
        ),
      );
    }
    this.snapshots.set(snapshotId, snapshot);
    return snapshotId;
  }

  getTaskFrequency(snapshotId: number, taskId: string): number {
    if (!this.snapshots.has(snapshotId)) {
      throw new Error("Snapshot not found");
    }

    const targetSnapshot = this.snapshots.get(snapshotId)!;
    let count = 0;

    // For each provider in the target snapshot, check all its revisions up to the generation in the snapshot
    for (const [
      providerName,
      maxGenerationId,
    ] of targetSnapshot.providerGenerationIDs) {
      const providerTasks = this.tasksStore.get(providerName);
      if (providerTasks) {
        // Check all generations from 1 to maxGenerationId for this provider
        for (
          let generationId = 1;
          generationId <= maxGenerationId;
          generationId++
        ) {
          const tasks = providerTasks.get(generationId);
          if (tasks) {
            const hasTask = tasks.some((task) => task.getID() === taskId);
            if (hasTask) {
              count++;
            }
          }
        }
      }
    }

    return count;
  }

  getTasksDiff(snapshotId: number): TaskSnapshotDiff {
    const currentSnapshot = this.snapshots.get(snapshotId);
    this.logger.silly("Getting tasks diff", {
      snapshotId,
      providerGenerationIDs: Array.from(
        currentSnapshot?.providerGenerationIDs.entries() || [],
      ).map(([providerName, generationId]) => ({
        providerName,
        generationId,
      })),
    });

    if (!currentSnapshot) {
      throw new Error("Snapshot not found");
    }

    const resolved: Task[] = [];
    const added: Task[] = [];
    const unresolved: Task[] = [];

    for (const [
      providerName,
      currentGenerationId,
    ] of currentSnapshot.providerGenerationIDs) {
      const storedProviderTasks = this.tasksStore.get(providerName);

      if (!storedProviderTasks) {
        continue;
      }
      // find stored tasks for the current generation ID
      const currentTasks = storedProviderTasks.get(currentGenerationId) || [];
      let lastGenerationId = -1;
      for (const availableGenerationId of storedProviderTasks.keys()) {
        if (availableGenerationId < currentGenerationId) {
          lastGenerationId = Math.max(lastGenerationId, availableGenerationId);
        }
      }
      if (lastGenerationId == -1) {
        // Last generation not found - all current tasks are added
        this.logger.silly("Last generation not found, all tasks are new", {
          providerName,
          currentGenerationId,
          lastGenerationId,
          currentTasks: currentTasks.map((task) => task.getID()),
        });
        added.push(...currentTasks);
      } else {
        // Last generation found - compute diff between last and current
        this.logger.silly("Last generation found, computing diff", {
          providerName,
          currentGenerationId,
          lastGenerationId,
          currentTasks: currentTasks.map((task) => task.getID()),
        });
        const lastTasks = storedProviderTasks.get(lastGenerationId) || [];
        const lastTaskIds = new Set(lastTasks.map((task) => task.getID()));
        const currentTaskIds = new Set(
          currentTasks.map((task) => task.getID()),
        );

        // Find resolved tasks (in last but not in current)
        for (const task of lastTasks) {
          if (!currentTaskIds.has(task.getID())) {
            resolved.push(task);
          } else {
            unresolved.push(task);
          }
        }

        // Find added tasks (in current but not in last)
        for (const task of currentTasks) {
          if (!lastTaskIds.has(task.getID())) {
            added.push(task);
          }
        }
      }
    }
    this.logger.silly("Tasks diff computed", {
      resolved: resolved.length,
      added: added.length,
      unresolved: unresolved.length,
    });
    return { resolved, added, unresolved };
  }

  public getLatestSnapshotId(): number {
    return this.snapshotCounter;
  }

  private generateSnapshotId(): number {
    return ++this.snapshotCounter;
  }
}
