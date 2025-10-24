import { TaskManager } from "../taskManager/taskManager";
import { Task } from "../taskProviders/types";

export interface FlattenedTask {
  uri: string;
  task: string;
}

export async function getFilteredTasks(
  taskManager: TaskManager,
  maxFrequency: number = 3
): Promise<FlattenedTask[]> {
  const taskSnapshot = await taskManager.getTasks();
  const currentTasks = Array.from(taskSnapshot.unresolved);

  const filteredTasks = currentTasks.filter((task) => {
    const frequency = taskManager.getTaskFrequency(taskManager.getLatestSnapshotId(), task.getID());
    return frequency < maxFrequency;
  });

  return flattenTasks(filteredTasks);
}

function flattenTasks(tasks: Task[]): FlattenedTask[] {
  return tasks.map((task) => ({
    uri: task.getUri(),
    task: task.toString()
  }));
}