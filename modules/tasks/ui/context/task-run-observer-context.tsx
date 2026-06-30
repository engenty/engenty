"use client";

import { createContext, type ReactNode, useContext, useEffect } from "react";
import type { TaskRun } from "../../src/schema/types.js";
import { useTaskRunObserver } from "../hooks/use-task-run-observer.js";

type TaskRunObserverContextValue = ReturnType<typeof useTaskRunObserver>;

const TaskRunObserverContext =
  createContext<TaskRunObserverContextValue | null>(null);

export function TaskRunObserverProvider({
  children,
  onObserverStatusChange,
  onRunComplete,
  task,
}: {
  children: ReactNode;
  onObserverStatusChange?: (
    status: TaskRunObserverContextValue["status"]
  ) => void;
  onRunComplete?: () => void;
  task: Parameters<typeof useTaskRunObserver>[0]["task"];
}) {
  const value = useTaskRunObserver({ onRunComplete, task });
  useEffect(() => {
    onObserverStatusChange?.(value.status);
  }, [onObserverStatusChange, value.status]);
  return (
    <TaskRunObserverContext.Provider value={value}>
      {children}
    </TaskRunObserverContext.Provider>
  );
}

export function useTaskRunObserverContext(): TaskRunObserverContextValue {
  const value = useContext(TaskRunObserverContext);
  if (!value) {
    throw new Error(
      "useTaskRunObserverContext must be used within TaskRunObserverProvider"
    );
  }
  return value;
}

export interface TaskRunObserverActions {
  onViewRun: (run: TaskRun) => void;
  startWorkOnTask: () => Promise<void>;
}

export type { TaskRunObserverStatus } from "../hooks/use-task-run-observer.js";
