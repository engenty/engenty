// Read-only "what the agent actually sees" panel for the Instructions tab. Shows
// the composed static system prompt (AGENTS.md + SOUL.md + skill hint) from the
// registry; per-run runtime context is injected separately and not shown here.
// Collapsed by default so it never steals height from the editor below.

import { Button, Card, CardContent, ScrollArea } from "@engenty/ui-core";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { useAgentEffectiveInstructionsQuery } from "../../lib/admin/agent-workspace-queries";

interface AgentEffectivePromptPreviewProps {
  agentId: string;
  t: (key: string) => string;
}

export function AgentEffectivePromptPreview({
  agentId,
  t,
}: AgentEffectivePromptPreviewProps) {
  const [open, setOpen] = useState(false);
  // Defer the fetch until expanded by passing an empty id while collapsed.
  const query = useAgentEffectiveInstructionsQuery(open ? agentId : "");

  return (
    <Card className="mb-3 shrink-0">
      <CardContent className="p-3">
        <Button
          className="h-auto w-full justify-start gap-2 px-1 py-1 text-left font-medium text-sm"
          onClick={() => setOpen((value) => !value)}
          variant="ghost"
        >
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          {t("instructions.effectiveTitle")}
        </Button>
        {open ? (
          query.isLoading ? (
            <p className="px-1 pt-2 text-muted-foreground text-sm">
              {t("instructions.effectiveLoading")}
            </p>
          ) : (
            <ScrollArea className="mt-2 max-h-72 rounded-md border bg-muted/30">
              <pre className="whitespace-pre-wrap p-3 font-mono text-muted-foreground text-xs">
                {query.data?.instructions ?? ""}
              </pre>
            </ScrollArea>
          )
        ) : (
          <p className="px-1 pt-1 text-muted-foreground text-xs">
            {t("instructions.effectiveHint")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
