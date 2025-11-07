import { type Logger } from "winston";

import type { TaskSnapshot } from "./types";
import {
  type TaskProvider,
  type Task,
  type VersionedTasks,
} from "../taskProviders";

interface GetTasksOptions {
  timeoutMs?: number;
  retryIntervalMs?: number;
}

export class TaskManager {
  private providers: TaskProvider[] = [];
  private readonly snapshots: Map<number, TaskSnapshot> = new Map();
  // store tasks by providers and their generations
  private readonly tasksStore: Map<string, Map<number, Task[]>> = new Map();
  private snapshotCounter: number = 0;

  constructor(
    private readonly logger: Logger,
    provider?: TaskProvider[],
  ) {
    if (provider) {
      this.providers = [...provider];
    }
    this.logger = logger.child({ module: "TaskManager" });

    // if (this.storeSnapshots) {
    //   this.snapshotDir = path.join(snapshotDir || os.tmpdir(), "snapshots");
    //   fs.mkdir(this.snapshotDir, { recursive: true })
    //     .then(() => {
    //       this.logger.info("Storing snapshots", {
    //         snapshotDir: this.snapshotDir,
    //       });
    //     })
    //     .catch((error) => {
    //       throw new Error(`Failed to create snapshot directory: ${error}`);
    //     });
    // }
  }

  async getTasks(options?: GetTasksOptions): Promise<number> {
    const timeoutMs = options?.timeoutMs || 30000; // 30 second default
    const retryIntervalMs = options?.retryIntervalMs || 1000; // 1 second default

    const lastSnapshot =
      this.snapshotCounter > 0
        ? this.snapshots.get(this.snapshotCounter)
        : null;

    // If no previous snapshot exists, get tasks from all providers
    if (!lastSnapshot) {
      const providerResults = await Promise.all(
        this.providers.map(async (provider) => {
          const versionedTasks = await provider.getCurrentTasks();
          return {
            providerName: provider.name,
            versionedTasks,
          };
        }),
      );
      return this.processProviderResults(providerResults);
    }

    const startTime = Date.now();
    const providersNeedingUpdate = new Set(this.providers.map((p) => p.name));
    const providerResults = new Map<
      string,
      { providerName: string; versionedTasks: VersionedTasks }
    >();

    while (
      Date.now() - startTime < timeoutMs &&
      providersNeedingUpdate.size > 0
    ) {
      // Only query providers that still need updates
      const providersToQuery = this.providers.filter((p) =>
        providersNeedingUpdate.has(p.name),
      );

      const batchResults = await Promise.all(
        providersToQuery.map(async (provider) => {
          const versionedTasks = await provider.getCurrentTasks();
          return { providerName: provider.name, versionedTasks };
        }),
      );

      // Check which providers returned updated generation IDs
      for (const result of batchResults) {
        const currentGenId = result.versionedTasks.generationId;
        const lastGenId = lastSnapshot.providerGenerationIDs.get(
          result.providerName,
        );
        providerResults.set(result.providerName, result);
        // if we didn't get the latest tasks, we will retry for this provider
        if (!lastGenId || currentGenId !== lastGenId) {
          providersNeedingUpdate.delete(result.providerName);
          this.logger.debug("Provider returned updated generation ID", {
            providerName: result.providerName,
            currentGenId,
            lastGenId,
            tasks: result.versionedTasks.tasks.length,
          });
        }
      }

      if (providersNeedingUpdate.size === 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
    }

    // If not all providers updated, return the last snapshot ID
    if (providersNeedingUpdate.size > 0) {
      this.logger.warn(
        "Not all providers returned updated generation IDs within timeout. Results could be out-of-date.",
        {
          providersStillPending: Array.from(providersNeedingUpdate),
          timeoutMs,
          lastSnapshotId: this.snapshotCounter,
        },
      );
    }

    // All providers updated - create new snapshot
    return this.processProviderResults(Array.from(providerResults.values()));
  }

  private async processProviderResults(
    providerResults: { providerName: string; versionedTasks: VersionedTasks }[],
  ): Promise<number> {
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

    const snapshotId = this.generateSnapshotId();
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

    // if (this.storeSnapshots) {
    //   const tasks = Array.from(providerGenerationIDs.entries())
    //     .flatMap(([providerName, generationId]) => {
    //       const tasksForGen =
    //         this.tasksStore.get(providerName)?.get(generationId) || [];
    //       return tasksForGen.map((task) => task.toJSON());
    //     })
    //     .filter(Boolean);
    //   await fs.writeFile(
    //     path.join(this.snapshotDir, `${snapshotId}.json`),
    //     JSON.stringify(
    //       {
    //         id: snapshot.id,
    //         timestamp: snapshot.timestamp,
    //         tasks,
    //       },
    //       null,
    //       2,
    //     ),
    //   );
    // }

    this.snapshots.set(snapshotId, snapshot);
    return snapshotId;
  }

  public getLatestSnapshotId(): number {
    return this.snapshotCounter;
  }

  public getSnapshot(snapshotId: number): TaskSnapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  public reset(): void {
    this.snapshots.clear();
    this.tasksStore.clear();
    this.snapshotCounter = 0;
    this.providers.forEach((provider) => provider.reset());
    this.logger.debug("TaskManager state reset");
  }

  public getAllTasksForSnapshot(snapshotId: number): Task[] {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      this.logger.warn("Snapshot not found when getting all tasks", {
        snapshotId,
      });
      return [];
    }

    return Array.from(snapshot.providerGenerationIDs.entries()).flatMap(
      ([providerName, generationId]) => {
        const providerTasks = this.tasksStore.get(providerName);
        return providerTasks?.get(generationId) || [];
      },
    );
  }

  public getBaselineSnapshotId(): number {
    // Return the first snapshot ID (after reset this would be 1)
    return 1;
  }

  private generateSnapshotId(): number {
    return ++this.snapshotCounter;
  }
}
