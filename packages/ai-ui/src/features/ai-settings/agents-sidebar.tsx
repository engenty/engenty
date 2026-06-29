import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
} from "@engenty/ui-core";
import type { AiAgentEntry } from "../../lib/admin/ai-runtime-api";

interface AgentsSidebarProps {
  agents: AiAgentEntry[];
  description: string;
  emptyLabel: string;
  onSelect: (agentId: string) => void;
  selectedAgentId: string;
  title: string;
}

export function AgentsSidebar({
  agents,
  description,
  emptyLabel,
  onSelect,
  selectedAgentId,
  title,
}: AgentsSidebarProps) {
  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 px-0">
        <ScrollArea className="h-[calc(100vh-18rem)]">
          <div className="space-y-1 px-3 pb-3">
            {agents.map((agent) => {
              const isActive = agent.id === selectedAgentId;
              return (
                <button
                  className={`w-full rounded-md border px-3 py-2 text-left transition ${
                    isActive
                      ? "border-primary bg-accent"
                      : "border-transparent hover:border-border hover:bg-accent/50"
                  }`}
                  key={agent.id}
                  onClick={() => onSelect(agent.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">{agent.name}</div>
                    <Badge
                      variant={
                        agent.kind === "system" ? "secondary" : "outline"
                      }
                    >
                      {agent.kind}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {agent.module_id}
                  </div>
                  <div className="truncate text-muted-foreground text-xs">
                    {agent.id}
                  </div>
                </button>
              );
            })}
            {agents.length === 0 ? (
              <p className="px-3 text-muted-foreground text-sm">{emptyLabel}</p>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
