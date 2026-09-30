import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  isGlobalTasksPath,
  tasksGlobalPaths,
  tasksPathsForSpace,
} from "./tasks-routes.js";

const SPACE_KEY_IN_PATH = /^\/s\/([^/]+)/;

/**
 * The space key in the URL (`/s/<key>/…`). Read from the path, not route
 * params: Plan's sidebar renders in the shell, outside the page's route, where
 * `useParams` has no `spaceKey`.
 */
function spaceKeyFromPath(pathname: string): string | null {
  const match = pathname.match(SPACE_KEY_IN_PATH);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Whether the viewer is on the global Plan (`/tasks/…`), outside any space. */
export function useIsGlobalPlan(): boolean {
  const { pathname } = useLocation();
  return !spaceKeyFromPath(pathname) && isGlobalTasksPath(pathname);
}

/**
 * Tasks paths for where the viewer is: inside a space (`/s/<key>/tasks/…`),
 * the global Plan (`/tasks/…`), or the module's own `/mdl/tasks/…`.
 */
export function useTasksPaths() {
  const { pathname } = useLocation();
  const spaceKey = spaceKeyFromPath(pathname);
  const global = !spaceKey && isGlobalTasksPath(pathname);
  return useMemo(
    () => (global ? tasksGlobalPaths : tasksPathsForSpace(spaceKey)),
    [global, spaceKey]
  );
}
