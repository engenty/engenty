import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PortalTask } from "../../api.js";
import { getPortalPhasesAndTasks, getPortalProjectInfo } from "../../api.js";
import { PortalHeader } from "../../components/portal-header.js";
import { isPortalVerified } from "../../components/portal-login.js";
import { PortalTaskDetail } from "../../components/portal-task-detail.js";

export function PortalTaskDetailPage() {
  const { projectId, taskId } = useParams<{
    projectId: string;
    taskId: string;
  }>();
  const navigate = useNavigate();
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [task, setTask] = useState<PortalTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const findTask = useCallback(
    (
      phases: { tasks: PortalTask[] }[],
      generalTasks: PortalTask[]
    ): PortalTask | null => {
      for (const p of phases) {
        const t = p.tasks.find((x) => x.id === taskId);
        if (t) {
          return t;
        }
      }
      return generalTasks.find((x) => x.id === taskId) ?? null;
    },
    [taskId]
  );

  useEffect(() => {
    if (!(projectId && taskId)) {
      return;
    }
    if (!isPortalVerified(projectId)) {
      navigate(`/portal/${projectId}`, { replace: true });
      return;
    }
    setLoading(true);
    Promise.all([
      getPortalProjectInfo(projectId),
      getPortalPhasesAndTasks(projectId),
    ])
      .then(([info, data]) => {
        setProjectTitle(info?.title ?? null);
        const t = findTask(data.phases, data.general_tasks);
        setTask(t);
        if (!t) {
          setError("Task not found");
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, [projectId, taskId, navigate, findTask]);

  if (!(projectId && taskId)) {
    return null;
  }
  if (loading) {
    return <p className="p-4 text-muted-foreground text-sm">Loading...</p>;
  }
  if (error && !task) {
    return <p className="p-4 text-red-600 text-sm">{error}</p>;
  }
  if (!task) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader
        projectId={projectId}
        projectTitle={projectTitle ?? "Project"}
      />
      <div className="mx-auto max-w-2xl p-4">
        <PortalTaskDetail projectId={projectId} task={task} />
      </div>
    </div>
  );
}
