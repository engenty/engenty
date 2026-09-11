import { ContextBoxView } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { Layers } from "lucide-react";
import type { TaskDetail } from "../../src/schema/types.js";
import type { TaskLinkedSessionRow } from "../lib/task-linked-sessions.js";
import {
  TaskContextEmptyState,
  useTaskContextSections,
} from "./task-context-box.js";

export function TaskContextToggle({
  hostKey,
  sessions,
  sessionsLoading,
  task,
}: {
  hostKey: string;
  sessions: TaskLinkedSessionRow[];
  sessionsLoading?: boolean;
  task: TaskDetail;
}) {
  const { t } = useTranslation("tasks");
  const sections = useTaskContextSections({
    hostKey,
    sessions,
    ...(sessionsLoading === undefined ? {} : { sessionsLoading }),
    task,
  });

  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("detail.workspace.contextLabel")}
          className={`${topbarIconButtonClassName} lg:hidden`}
          size="sm"
          variant="outline"
        >
          <Layers className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 border-0 bg-transparent p-0">
        <ContextBoxView
          ariaLabel={t("detail.workspace.contextLabel")}
          emptyContent={<TaskContextEmptyState />}
          sections={sections}
        />
      </PopoverContent>
    </Popover>
  );
}
