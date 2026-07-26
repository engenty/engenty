// Topbar actions on routine detail: run CTA, edit/delete icons, overflow menu,
// plus artifacts pane (chat-style) and runs sheet.
import { ArtifactPaneToggle, ENGENTY_COPILOT_HOST_KEY } from "@engenty/ai-ui";
import {
  type RoutineDto,
  useRunRoutineNowMutation,
} from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SidePanel,
  SidePanelContent,
  SidePanelHeader,
  SidePanelTitle,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import {
  Edit,
  History,
  Loader2,
  MoreVertical,
  Play,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { getTaskRuns } from "../api.js";
import { taskKeys } from "../tasks-queries.js";
import { RoutineRunsSection } from "./routine-runs-section.js";

const ICON_BTN = cn(topbarIconButtonClassName, "!size-7 !w-7 !min-w-7 !px-0");

export function RoutineDetailTopbarActions({
  onDelete,
  onEdit,
  routine,
}: {
  onDelete: () => void;
  onEdit: () => void;
  routine: RoutineDto;
}) {
  const { t } = useTranslation("tasks");
  const [runsOpen, setRunsOpen] = useState(false);
  const runMutation = useRunRoutineNowMutation();
  const isCustom = routine.source === "custom";
  const container = useMemo(
    () => ({ id: routine.id, tier: "routine" as const }),
    [routine.id]
  );
  const taskId = routine.standing_task_id;
  const runsQuery = useQuery({
    enabled: Boolean(taskId),
    queryFn: ({ signal }) => getTaskRuns(taskId!, signal),
    queryKey: taskId
      ? taskKeys.runs(taskId)
      : ["tasks", "routine-runs", "none"],
  });
  const hasRuns = Boolean(taskId) && (runsQuery.data?.length ?? 0) > 0;

  return (
    <div className="flex items-center gap-0.5">
      <Button
        className="mr-0.5 gap-1.5 font-medium"
        disabled={runMutation.isPending || !routine.enabled}
        onClick={() => runMutation.mutate(routine.id)}
        size="sm"
        type="button"
      >
        {runMutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Play className="size-3.5 fill-current" />
        )}
        {t("routines.detail.runNow")}
      </Button>

      {isCustom ? (
        <Button
          aria-label={t("routines.detail.edit")}
          className={ICON_BTN}
          onClick={onEdit}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Edit className="size-4" />
        </Button>
      ) : null}

      {isCustom ? (
        <Button
          aria-label={t("routines.detail.delete")}
          className={cn(ICON_BTN, "text-destructive hover:text-destructive")}
          onClick={onDelete}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-4" />
        </Button>
      ) : null}

      {isCustom ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("routines.detail.actionsMenu")}
              className={ICON_BTN}
              size="icon"
              type="button"
              variant="ghost"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem onClick={onEdit}>
              <Edit className="size-4" />
              {t("routines.detail.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
              {t("routines.detail.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <ArtifactPaneToggle
        container={container}
        hostKey={ENGENTY_COPILOT_HOST_KEY}
      />
      <Button
        aria-label={t("routines.detail.openRuns")}
        className={cn(ICON_BTN, !hasRuns && "opacity-40")}
        onClick={() => setRunsOpen(true)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <History className="size-4" />
      </Button>

      <SidePanel onOpenChange={setRunsOpen} open={runsOpen}>
        <SidePanelContent className="flex w-full flex-col gap-4 sm:max-w-md">
          <SidePanelHeader>
            <SidePanelTitle>{t("routines.detail.runs")}</SidePanelTitle>
          </SidePanelHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4">
            <RoutineRunsSection hideHeading routine={routine} />
          </div>
        </SidePanelContent>
      </SidePanel>
    </div>
  );
}
