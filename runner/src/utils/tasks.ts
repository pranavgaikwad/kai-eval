import { TaskManager } from "../taskManager";
import { Task } from "../taskProviders";

export interface FlattenedTask {
  uri: string;
  task: string;
}

export async function getFilteredTasks(
  taskManager: TaskManager,
  maxFrequency: number = 3,
): Promise<FlattenedTask[]> {
  const taskSnapshot = await taskManager.getTasks();
  const currentTasks = Array.from(taskSnapshot.added);

  const filteredTasks = currentTasks.filter((task) => {
    const frequency = taskManager.getTaskFrequency(
      taskManager.getLatestSnapshotId(),
      task.getID(),
    );
    return frequency < maxFrequency;
  });

  const seen = new Set<string>();
  const uniqueTasks = filteredTasks.filter((task) => {
    const key = `${task.getUri()}::${task.toString()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return Array.from(new Set(flattenTasks(uniqueTasks)));
}

function flattenTasks(tasks: Task[]): FlattenedTask[] {
  return tasks.map((task) => ({
    uri: task.getUri(),
    task: task.toString(),
  }));
}
