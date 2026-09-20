// Card view for the Flows catalog.
//
// Cards are the default because a flow is chosen by READING what it does — the
// description is the deciding field, which is why the track is the wide one.
import { useTranslation } from "@engenty/i18n/ui";
import { adminListCardsGridClassName, Badge, cn } from "@engenty/ui-core";
import { FileTerminal, ShieldCheck, Wand2 } from "lucide-react";
import { formatEngentyActionSource } from "../agents-workspace/workflow-record-utils.js";
import {
  flowEntryStatus,
  type WorkflowCatalogEntry,
} from "./workflow-flows-state.js";

interface WorkflowLibraryCardsProps {
  flows: readonly WorkflowCatalogEntry[];
  onOpen: (flow: WorkflowCatalogEntry) => void;
}

export function WorkflowLibraryCards({
  flows,
  onOpen,
}: WorkflowLibraryCardsProps) {
  const { t } = useTranslation("ai-ui");

  return (
    <div className={adminListCardsGridClassName("compact", { track: "wide" })}>
      {flows.map((flow) => (
        <button
          className={cn(
            "ui-card-raised flex flex-col p-4 text-left",
            flowEntryStatus(flow) !== "active" &&
              "border border-border border-dashed"
          )}
          key={flow.id}
          onClick={() => onOpen(flow)}
          type="button"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-medium text-sm">{flow.name}</p>
            <div className="flex shrink-0 items-center gap-1">
              <FlowSurfaceBadge flow={flow} />
              <FlowStatusBadge flow={flow} />
            </div>
          </div>
          {flow.description ? (
            <p className="mt-1.5 line-clamp-2 text-muted-foreground text-xs leading-snug">
              {flow.description}
            </p>
          ) : null}
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1">
              <FileTerminal aria-hidden className="size-3 shrink-0" />
              <span className="truncate">
                {flow.moduleId
                  ? formatEngentyActionSource(flow.moduleId)
                  : t("workflows.source.authored")}
              </span>
            </span>
            {flow.contextType ? (
              <span className="truncate">{flow.contextType}</span>
            ) : null}
            {flowEntryStatus(flow) === "active" ? (
              <span className="ml-auto flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <ShieldCheck aria-hidden className="size-3" />
                {t("workflows.gated")}
              </span>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  );
}

/** Marks a wizard: the person who starts it answers one page per gate. */
export function FlowSurfaceBadge({ flow }: { flow: WorkflowCatalogEntry }) {
  const { t } = useTranslation("ai-ui");
  if (flow.surface !== "wizard") {
    return null;
  }
  return (
    <Badge className="gap-1" variant="outline">
      <Wand2 aria-hidden className="size-3" />
      {t("workflows.surface.wizard", { defaultValue: "Wizard" })}
    </Badge>
  );
}

/**
 * One status vocabulary for every row: Ready when it can run (published, or
 * declared and prepared on first use), Draft while a version awaits publish.
 * The version number is detail-page information, not a status.
 */
export function FlowStatusBadge({ flow }: { flow: WorkflowCatalogEntry }) {
  const { t } = useTranslation("ai-ui");
  const status = flowEntryStatus(flow);
  if (status === "active" || status === "declared") {
    return (
      <Badge className="border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
        {t("workflows.status.active")}
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge className="border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300">
        {t("workflows.status.draft")}
      </Badge>
    );
  }
  return <Badge variant="secondary">{t("workflows.status.disabled")}</Badge>;
}
