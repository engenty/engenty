import { Badge } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";

import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-api";

export function isAgentRunInFlight(
  status: AiAgentRunSummary["status"]
): boolean {
  return (
    status === "queued" ||
    status === "running" ||
    status === "waiting_for_input" ||
    status === "waiting_for_approval"
  );
}

export function AgentDetailTabLabel({
  count,
  label,
  showSpinner,
}: {
  count: number;
  label: string;
  showSpinner?: boolean;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <span className="truncate">{label}</span>
      {showSpinner ? (
        <AnimatedLoaderIcon
          className="shrink-0 text-primary"
          play="always"
          size="xs"
        />
      ) : null}
      <Badge
        className="h-5 min-w-5 shrink-0 justify-center px-1.5 py-0 tabular-nums"
        variant="secondary"
      >
        {count}
      </Badge>
    </span>
  );
}
