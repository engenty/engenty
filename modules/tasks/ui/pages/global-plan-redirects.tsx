import { Navigate } from "react-router-dom";
import { tasksGlobalPaths } from "../lib/tasks-routes.js";

/** `/tasks` — the global Plan opens on its briefing. */
export function GlobalPlanRedirectPage() {
  return <Navigate replace to={tasksGlobalPaths.briefing} />;
}

/** `/work` — the cross-space list moved to the global Plan's `/tasks/list`. */
export function WorkRedirectPage() {
  return <Navigate replace to={tasksGlobalPaths.list} />;
}
