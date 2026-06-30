import { useTranslation } from "@engenty/i18n/ui";
import { Button } from "@engenty/ui-core";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PortalTask } from "../api.js";

interface PortalTaskDetailProps {
  projectId: string;
  task: PortalTask;
}

export function PortalTaskDetail({ projectId, task }: PortalTaskDetailProps) {
  const { t } = useTranslation("projects");
  const navigate = useNavigate();

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
    <div className="space-y-4">
      <Button
        onClick={() => navigate(`/portal/${projectId}`)}
        size="sm"
        variant="ghost"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        {t("portal.back")}
      </Button>
      <div className="ui-canvas-panel rounded-lg border-0 bg-card p-4">
        <h2 className="font-semibold text-lg">{task.title}</h2>
        <p className="mt-2 text-muted-foreground text-sm">
          {statusLabel(task.status)}
        </p>
        {task.content && (
          <div className="mt-4 whitespace-pre-wrap text-sm">{task.content}</div>
        )}
      </div>
    </div>
  );
}
