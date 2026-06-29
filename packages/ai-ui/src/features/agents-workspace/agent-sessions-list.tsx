import { ScrollArea } from "@engenty/ui-core";
import type { AiAdminSessionRow } from "../../lib/admin/ai-runtime-api";
import { AgentSessionListItem } from "./agent-session-list-item";

interface AgentSessionsListProps {
  emptyLabel: string;
  isLoading: boolean;
  onRequestDelete: (threadId: string) => void;
  onSelect: (threadId: string) => void;
  selectedThreadId: string;
  sessions: AiAdminSessionRow[];
  t: (key: string) => string;
}

export function AgentSessionsList({
  emptyLabel,
  isLoading,
  onRequestDelete,
  onSelect,
  selectedThreadId,
  sessions,
  t,
}: AgentSessionsListProps) {
  return (
    <ScrollArea className="h-full">
      <div className="overflow-hidden rounded-lg border bg-background">
        {sessions.map((session) => (
          <AgentSessionListItem
            isSelected={session.id === selectedThreadId}
            key={session.id}
            onRequestDelete={onRequestDelete}
            onSelect={onSelect}
            session={session}
            t={t}
          />
        ))}
        {!isLoading && sessions.length === 0 ? (
          <p className="px-3 py-4 text-muted-foreground text-sm">
            {emptyLabel}
          </p>
        ) : null}
      </div>
    </ScrollArea>
  );
}
