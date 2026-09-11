import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { tasksPathsForSpace } from "./tasks-routes.js";

/**
 * Tasks links follow the Space currently shown by the shell.
 *
 * Outside a Space this falls back to the canonical `/mdl/tasks/*` routes.
 */
export function useTasksPaths() {
  const { spaceKey } = useParams<{ spaceKey?: string }>();
  return useMemo(() => tasksPathsForSpace(spaceKey), [spaceKey]);
}
