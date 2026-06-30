import { Navigate } from "react-router-dom";
import { tasksPaths } from "../lib/tasks-routes.js";

export function TasksRedirectPage() {
  return <Navigate replace to={tasksPaths.briefing} />;
}
