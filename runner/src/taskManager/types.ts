import { type Task } from "../taskProviders";

export interface TaskSnapshot {
  id: number;
  timestamp: Date;
  providerGenerationIDs: Map<string, number>;
}

export interface TaskSnapshotDiff {
  resolved: Task[];
  added: Task[];
  unresolved: Task[];
}
