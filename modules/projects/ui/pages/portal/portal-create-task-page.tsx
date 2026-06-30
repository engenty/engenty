import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPortalProjectInfo } from "../../api.js";
import { PortalCreateTask } from "../../components/portal-create-task.js";
import { PortalHeader } from "../../components/portal-header.js";
import { isPortalVerified } from "../../components/portal-login.js";

export function PortalCreateTaskPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [projectTitle, setProjectTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    if (!isPortalVerified(projectId)) {
      navigate(`/portal/${projectId}`, { replace: true });
      return;
    }
    getPortalProjectInfo(projectId)
      .then((info) => setProjectTitle(info?.title ?? null))
      .catch(() => setProjectTitle(null))
      .finally(() => setLoading(false));
  }, [projectId, navigate]);

  if (!projectId) {
    return null;
  }
  if (loading) {
    return <p className="p-4 text-muted-foreground text-sm">Loading...</p>;
  }

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader
        projectId={projectId}
        projectTitle={projectTitle ?? "Project"}
      />
      <div className="mx-auto max-w-2xl p-4">
        <PortalCreateTask projectId={projectId} />
      </div>
    </div>
  );
}
