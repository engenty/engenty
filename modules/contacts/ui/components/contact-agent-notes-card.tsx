// "Agent notes" card (memory Phase 3): entity-scoped memory records agents
// learned about this contact, with archive. Renders nothing while empty or
// when the viewer lacks module.memory.read (the list op 403s → error state).
import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button, Card } from "@engenty/ui-core";
import { X } from "lucide-react";
import { contactEntityRef } from "../api/memory.js";
import type { ContactListItem } from "../api.js";
import {
  useArchiveContactMemoryMutation,
  useContactMemoriesQuery,
} from "../memory-queries.js";

interface ContactAgentNotesCardProps {
  entity: ContactListItem;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function ContactAgentNotesCard({ entity }: ContactAgentNotesCardProps) {
  const { t } = useTranslation("contacts");
  const entityRef = contactEntityRef(entity);
  const memoriesQuery = useContactMemoriesQuery(entityRef);
  const archiveMutation = useArchiveContactMemoryMutation(entityRef);

  const records = memoriesQuery.data ?? [];
  if (
    memoriesQuery.isLoading ||
    memoriesQuery.isError ||
    records.length === 0
  ) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-lg">
        {t("agentNotes.title", { defaultValue: "Agent notes" })}
      </h2>
      <Card className="px-4 py-4">
        <div className="space-y-3">
          {records.map((record) => {
            const provenance = [
              record.agent_type_key ??
                t("agentNotes.agentFallback", { defaultValue: "agent" }),
              formatDay(record.updated_at),
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                className="group flex items-start justify-between gap-4"
                key={record.id}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{record.title}</span>
                    <Badge variant="outline">{record.kind}</Badge>
                  </div>
                  <p className="whitespace-pre-line text-muted-foreground text-sm">
                    {record.body_md}
                  </p>
                  <p className="text-muted-foreground text-xs">{provenance}</p>
                </div>
                <Button
                  className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  disabled={archiveMutation.isPending}
                  onClick={() => archiveMutation.mutate(record.id)}
                  size="icon"
                  title={t("agentNotes.archive", { defaultValue: "Archive" })}
                  type="button"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
