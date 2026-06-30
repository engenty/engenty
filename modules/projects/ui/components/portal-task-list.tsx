import { useTranslation } from "@engenty/i18n/ui";
import { Button, Card, CardContent, CardHeader } from "@engenty/ui-core";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PortalPhase, PortalTask } from "../api.js";

interface PortalTaskListProps {
  generalTasks: PortalTask[];
  phases: PortalPhase[];
  projectId: string;
}

export function PortalTaskList({
  projectId,
  phases,
  generalTasks,
}: PortalTaskListProps) {
  const { t } = useTranslation("projects");
  const navigate = useNavigate();

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString() : null;

  const statusLabel = (s: string) => {
    switch (s) {
      case "todo":
        return t("detail.status.todo");
      case "in_progress":
        return t("detail.status.in_progress");
      case "done":
        return t("detail.status.done");
      case "request":
        return t("detail.status.request");
      default:
        return s;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-lg">{t("portal.phasesAndTasks")}</h2>
        <Button
          onClick={() => navigate(`/portal/${projectId}/tasks/new`)}
          size="sm"
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("portal.newRequest")}
        </Button>
      </div>

      {generalTasks.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <h3 className="font-medium">{t("detail.generalTasks")}</h3>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {generalTasks.map((task) => (
              <div
                className="flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/50"
                key={task.id}
                onClick={() =>
                  navigate(`/portal/${projectId}/tasks/${task.id}`)
                }
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  navigate(`/portal/${projectId}/tasks/${task.id}`)
                }
                role="button"
                tabIndex={0}
              >
                <span className="font-medium">{task.title}</span>
                <span className="text-muted-foreground text-sm">
                  {statusLabel(task.status)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {phases.map((phase) => (
        <Card key={phase.id}>
          <CardHeader className="py-3">
            <h3 className="font-medium">{phase.title}</h3>
            {phase.start_date && phase.end_date && (
              <p className="text-muted-foreground text-sm">
                {formatDate(phase.start_date)} – {formatDate(phase.end_date)}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {phase.tasks.map((task) => (
              <div
                className="flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/50"
                key={task.id}
                onClick={() =>
                  navigate(`/portal/${projectId}/tasks/${task.id}`)
                }
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  navigate(`/portal/${projectId}/tasks/${task.id}`)
                }
                role="button"
                tabIndex={0}
              >
                <span className="font-medium">{task.title}</span>
                <span className="text-muted-foreground text-sm">
                  {statusLabel(task.status)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {phases.length === 0 && generalTasks.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("portal.noTasks")}</p>
      )}
    </div>
  );
}
