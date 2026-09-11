import { formatObjectRef } from "@engenty/ai-core/browser";
import {
  activateArtifact,
  type ContextBoxSectionModel,
  ContextBoxView,
  iconForArtifactType,
  openObjectPaneTab,
  openWorkFilePaneTab,
  useContainerArtifactsQuery,
  useContextObjectItems,
  useWorkFilesQuery,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { Bot, FileText, Link2, MessageSquare } from "lucide-react";
import { useMemo } from "react";
import type { TaskDetail } from "../../src/schema/types.js";
import { formatAgentTypeKey } from "../lib/format-assignee.js";
import { taskContextObjectRef } from "../lib/task-context-object-ref.js";
import type { TaskLinkedSessionRow } from "../lib/task-linked-sessions.js";

interface TaskContextSourceProps {
  hostKey: string;
  sessions: TaskLinkedSessionRow[];
  sessionsLoading?: boolean;
  task: TaskDetail;
}

interface TaskContextBoxProps extends TaskContextSourceProps {
  className?: string;
}

function contextLabel(context: TaskDetail["contexts"][number]): string {
  const title = context.metadata.title ?? context.metadata.name;
  if (typeof title === "string" && title.trim()) {
    return title;
  }
  const ref = taskContextObjectRef(context);
  return ref
    ? formatObjectRef(ref)
    : `${context.context_type}:${context.context_id}`;
}

export function useTaskContextSections({
  hostKey,
  sessions,
  sessionsLoading = false,
  task,
}: TaskContextSourceProps): ContextBoxSectionModel[] {
  const { t } = useTranslation("tasks");
  const container = useMemo(
    () => ({ id: task.id, tier: "task" as const }),
    [task.id]
  );
  const artifactsQuery = useContainerArtifactsQuery(container);
  const filesQuery = useWorkFilesQuery(container);
  const artifacts = artifactsQuery.data ?? [];
  const files = filesQuery.data?.entries ?? [];
  const resolvedObjects = useMemo(
    () =>
      task.contexts.flatMap((context) => {
        const ref = taskContextObjectRef(context);
        return ref
          ? [
              {
                key: formatObjectRef(ref),
                ref,
                title: contextLabel(context),
              },
            ]
          : [];
      }),
    [task.contexts]
  );
  const objectItems = useContextObjectItems(resolvedObjects, {
    openInPanel: (ref, options) => openObjectPaneTab(hostKey, ref, options),
  });
  const unresolvedObjectItems = task.contexts
    .filter(
      (context) =>
        context.context_type !== "project" && !taskContextObjectRef(context)
    )
    .map((context) => ({
      icon: Link2,
      key: context.id,
      label: contextLabel(context),
    }));
  return [
    {
      id: "objects",
      items: [...objectItems, ...unresolvedObjectItems],
      label: t("detail.workspace.objects"),
    },
    {
      id: "artifacts",
      items: artifacts.map((artifact) => ({
        icon: iconForArtifactType(artifact.type),
        key: artifact.id,
        label: artifact.title,
        onClick: () => activateArtifact(hostKey, artifact.id),
      })),
      label: t("detail.workspace.artifacts"),
    },
    {
      id: "files",
      items: files.map((file) => ({
        icon: FileText,
        key: file.key,
        label: file.filename,
        onClick: () =>
          openWorkFilePaneTab(hostKey, {
            entryKey: file.key,
            filename: file.filename,
          }),
      })),
      label: t("detail.workspace.files"),
    },
    {
      id: "sessions",
      items: sessionsLoading
        ? [{ icon: MessageSquare, key: "loading", label: "…" }]
        : sessions.map((session) => ({
            href: `/mdl/engenty-copilot/chat/${session.id}`,
            icon: session.kind === "agent" ? Bot : MessageSquare,
            key: session.id,
            label:
              session.title?.trim() ||
              t("detail.workspace.linkedSessionUntitled", {
                agent: formatAgentTypeKey(session.agent_type_key),
              }),
          })),
      label: t("detail.workspace.linkedSessions"),
    },
  ];
}

export function TaskContextEmptyState() {
  const { t } = useTranslation("tasks");
  return (
    <div className="space-y-1">
      <p className="px-2 py-0.5 text-muted-foreground text-xxs uppercase tracking-[0.1em]">
        {t("detail.workspace.contextLabel")}
      </p>
      <p className="px-2 py-2 text-muted-foreground text-xs">
        {t("detail.workspace.empty")}
      </p>
    </div>
  );
}

export function TaskContextBox({ className, ...source }: TaskContextBoxProps) {
  const { t } = useTranslation("tasks");
  const sections = useTaskContextSections(source);
  return (
    <ContextBoxView
      ariaLabel={t("detail.workspace.contextLabel")}
      className={className}
      emptyContent={<TaskContextEmptyState />}
      sections={sections}
    />
  );
}
