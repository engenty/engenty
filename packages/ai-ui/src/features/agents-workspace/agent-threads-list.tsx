import { ScrollArea } from "@engenty/ui-core";
import type { AiAdminThreadRow } from "../../lib/admin/ai-runtime-api.js";
import { AgentThreadListItem } from "./agent-thread-list-item.js";

interface AgentThreadsListProps {
  emptyLabel: string;
  isLoading: boolean;
  onRequestDelete: (threadId: string) => void;
  onSelect: (threadId: string) => void;
  selectedThreadId: string;
  t: (key: string) => string;
  threads: AiAdminThreadRow[];
}

export function AgentThreadsList({
  emptyLabel,
  isLoading,
  onRequestDelete,
  onSelect,
  selectedThreadId,
  t,
  threads,
}: AgentThreadsListProps) {
  return (
    <ScrollArea className="h-full">
      <div className="overflow-hidden rounded-lg border bg-background">
        {threads.map((thread) => (
          <AgentThreadListItem
            isSelected={thread.id === selectedThreadId}
            key={thread.id}
            onRequestDelete={onRequestDelete}
            onSelect={onSelect}
            t={t}
            thread={thread}
          />
        ))}
        {!isLoading && threads.length === 0 ? (
          <p className="px-3 py-4 text-muted-foreground text-sm">
            {emptyLabel}
          </p>
        ) : null}
      </div>
    </ScrollArea>
  );
}
