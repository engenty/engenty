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
import {
  FolderKanban,
  Maximize2,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react";

interface TaskFormPanelHeaderProps {
  canDelete: boolean;
  canExpand: boolean;
  onClose: () => void;
  onDelete: () => void;
  onExpand: () => void;
  projectName?: string;
  title: string;
}

/** Top chrome for the project task side panel: context chip + icon actions. */
export function TaskFormPanelHeader({
  canDelete,
  canExpand,
  onClose,
  onDelete,
  onExpand,
  projectName,
  title,
}: TaskFormPanelHeaderProps) {
  const { t } = useTranslation("projects");

  return (
    <SidePanelHeader className="flex flex-row items-center gap-2 border-b px-2 py-1.5">
      <SidePanelTitle className="sr-only">{title}</SidePanelTitle>
      {projectName ? (
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-medium text-foreground text-xs">
          <FolderKanban className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{projectName}</span>
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <div className="flex shrink-0 items-center gap-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("detail.taskForm.actionsMenu")}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal className="h-4 w-4" />
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
        <Button
          aria-label={t("detail.taskForm.close")}
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
