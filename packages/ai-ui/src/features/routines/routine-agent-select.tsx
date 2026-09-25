// Agent picker for the routine form — lists the agents that may OWN a routine:
// specialists only. Copilot answers a person who is present; it is not a
// worker, and a routine on it leaves nobody in the Space visibly owning the
// job. Keep in step with
// `canAgentOwnRoutine` in @engenty/plugin-sdk — this filter is the courtesy,
// that check is the rule.
import { useTranslation } from "@engenty/i18n/ui";
import { Label } from "@engenty/ui-core";
import { useAiAgentsQuery } from "../../lib/admin/ai-runtime-queries.js";

const NON_WORKER_AGENT_IDS = new Set(["engenty.copilot"]);

/** Mirrors the server rule; falls back to the id shape for rows without a role. */
export function canOwnRoutine(agent: {
  id: string;
  role?: string | null;
}): boolean {
  if (agent.role) {
    return agent.role === "specialist";
  }
  return !(
    agent.id.startsWith("chatbot.") || NON_WORKER_AGENT_IDS.has(agent.id)
  );
}

export interface RoutineAgentSelectProps {
  hideLabel?: boolean;
  id: string;
  onChange: (agentId: string) => void;
  value: string;
}

export function RoutineAgentSelect({
  hideLabel = false,
  id,
  value,
  onChange,
}: RoutineAgentSelectProps) {
  const { t } = useTranslation("ai-ui");
  const agentsQuery = useAiAgentsQuery(true);
  const agents = agentsQuery.data?.agents ?? [];

  return (
    <div className="space-y-1.5">
      {hideLabel ? null : (
        <Label htmlFor={id}>{t("routines.form.agent")}</Label>
      )}
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        id={id}
        onChange={(e) => onChange(e.target.value)}
        required
        value={value}
      >
        <option value="">{t("routines.form.agentPlaceholder")}</option>
        {agents
          .filter((agent) => canOwnRoutine(agent))
          .map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} ({agent.id})
            </option>
          ))}
      </select>
    </div>
  );
}
