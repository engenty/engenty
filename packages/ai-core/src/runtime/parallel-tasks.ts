export interface ParallelTaskSpec<T> {
  id: string;
  run: () => Promise<T>;
}

export type ParallelTaskResult<T> =
  | { id: string; status: "fulfilled"; value: T }
  | { id: string; status: "rejected"; error: unknown };

export interface RunParallelTasksOptions {
  concurrency?: number;
}

export async function runParallelTasks<T>(
  tasks: readonly ParallelTaskSpec<T>[],
  options: RunParallelTasksOptions = {}
): Promise<ParallelTaskResult<T>[]> {
  if (tasks.length === 0) {
    return [];
  }

  const concurrency = Math.max(
    1,
    Math.floor(options.concurrency ?? tasks.length)
  );
  const results = new Array<ParallelTaskResult<T>>(tasks.length);
  let nextIndex = 0;

  const runNext = async () => {
    while (nextIndex < tasks.length) {
      const taskIndex = nextIndex;
      nextIndex += 1;
      const task = tasks[taskIndex];
      try {
        const value = await task.run();
        results[taskIndex] = {
          id: task.id,
          status: "fulfilled",
          value,
        };
      } catch (error) {
        results[taskIndex] = {
          id: task.id,
          status: "rejected",
          error,
        };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => runNext())
  );

  return results;
}
