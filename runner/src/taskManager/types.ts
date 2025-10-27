import { Task } from "../taskProviders";

export interface TaskSnapshot {
  id: number;
  timestamp: Date;
  tasks: Map<string, Task>;
}

export interface TaskSnapshotDiff {
  resolved: Task[];
  added: Task[];
  unresolved: Task[];
}
