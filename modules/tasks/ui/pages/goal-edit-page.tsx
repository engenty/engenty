import { Navigate, useParams } from "react-router-dom";
import { tasksPaths } from "../lib/tasks-routes.js";

export function GoalEditPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <Navigate replace to={tasksPaths.goals} />;
  }

  return <Navigate replace to={tasksPaths.goalDetail(id)} />;
}
