import { Navigate, useParams } from "react-router-dom";
import { tasksPaths } from "../lib/tasks-routes.js";

export function TaskEditPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <Navigate replace to={tasksPaths.list} />;
  }

  return <Navigate replace to={tasksPaths.taskDetail(id)} />;
}
