import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SidePanelHeader,
  SidePanelTitle,
} from "@engenty/ui-core";
import { FolderKanban, Maximize2, MoreVertical, Trash2, X } from "lucide-react";

interface TaskFormPanelHeaderProps {
  actionsMenuLabel?: string;
  canDelete: boolean;
  canExpand?: boolean;
  closeLabel?: string;
  onClose: () => void;
  onDelete: () => void;
  onExpand?: () => void;
  projectName?: string;
  showExpand?: boolean;
  title: string;
}

/** Top chrome for the project task/phase side panel: project context + icon actions. */
export function TaskFormPanelHeader({
  actionsMenuLabel,
  canDelete,
  canExpand = false,
  closeLabel,
  onClose,
  onDelete,
  onExpand,
  projectName,
  showExpand = true,
  title,
}: TaskFormPanelHeaderProps) {
  const { t } = useTranslation("projects");

  return (
    <SidePanelHeader className="flex flex-row items-center gap-2 border-b px-2 py-1.5">
      <SidePanelTitle className="sr-only">{title}</SidePanelTitle>
      {projectName ? (
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 px-1 font-medium text-muted-foreground text-xs">
          <FolderKanban className="h-3 w-3 shrink-0" />
          <span className="truncate">{projectName}</span>
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <div className="flex shrink-0 items-center gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={actionsMenuLabel ?? t("detail.taskForm.actionsMenu")}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={!canDelete}
              onClick={onDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {showExpand ? (
          <Button
            aria-label={t("detail.taskForm.expand")}
            disabled={!canExpand}
            onClick={onExpand}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          aria-label={closeLabel ?? t("detail.taskForm.close")}
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </SidePanelHeader>
  );
}
