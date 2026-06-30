import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { PortalPhase, PortalProjectInfo, PortalTask } from "../../api.js";
import { getPortalPhasesAndTasks, getPortalProjectInfo } from "../../api.js";
import { PortalHeader } from "../../components/portal-header.js";
import {
  isPortalVerified,
  PortalLogin,
} from "../../components/portal-login.js";
import { PortalTaskList } from "../../components/portal-task-list.js";

export function PortalPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [projectInfo, setProjectInfo] = useState<PortalProjectInfo | null>(
    null
  );
  const [phases, setPhases] = useState<PortalPhase[]>([]);
  const [generalTasks, setGeneralTasks] = useState<PortalTask[]>([]);
  const [infoLoading, setInfoLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load project info on mount
  useEffect(() => {
    if (!projectId) {
      return;
    }
    setInfoLoading(true);
    getPortalProjectInfo(projectId)
      .then((info) => {
        setProjectInfo(info);
        setError(info ? null : "Project not found");
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setInfoLoading(false));
  }, [projectId]);

  // Load phases & tasks once access is granted
  const loadPhasesAndTasks = useCallback(async () => {
    if (!projectId) {
      return;
    }
    setDataLoading(true);
    try {
      const data = await getPortalPhasesAndTasks(projectId);
      setPhases(data.phases ?? []);
      setGeneralTasks(data.general_tasks ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setDataLoading(false);
    }
  }, [projectId]);

  // Auto-load data when no password is required or already verified
  const [dataRequested, setDataRequested] = useState(false);
  useEffect(() => {
    if (!(projectId && projectInfo) || dataRequested) {
      return;
    }
    if (isPortalVerified(projectId) || !projectInfo.password_required) {
      setDataRequested(true);
      loadPhasesAndTasks();
    }
  }, [projectId, projectInfo, dataRequested, loadPhasesAndTasks]);

  const handleVerified = useCallback(() => {
    setDataRequested(true);
    loadPhasesAndTasks();
  }, [loadPhasesAndTasks]);

  const handleLogout = useCallback(() => {
    window.location.reload();
  }, []);

  if (!projectId) {
    return <p className="p-4 text-muted-foreground text-sm">Invalid project</p>;
  }
  if (infoLoading) {
    return <p className="p-4 text-muted-foreground text-sm">Loading...</p>;
  }
  if (error && !projectInfo) {
    return <p className="p-4 text-red-600 text-sm">{error}</p>;
  }
  if (!projectInfo) {
    return (
      <p className="p-4 text-muted-foreground text-sm">
        Project not found or portal disabled
      </p>
    );
  }

  if (!isPortalVerified(projectId) && projectInfo.password_required) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <PortalLogin
          introText={projectInfo.portal_intro_text}
          onVerified={handleVerified}
          projectId={projectId}
          projectTitle={projectInfo.title}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PortalHeader
        onLogout={handleLogout}
        projectId={projectId}
        projectTitle={projectInfo.title}
      />
      <div className="mx-auto max-w-2xl p-4">
        {dataLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : (
          <PortalTaskList
            generalTasks={generalTasks}
            phases={phases}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  );
}
