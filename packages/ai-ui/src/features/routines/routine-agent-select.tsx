// Agent picker for the routine form — lists runtime agents minus chatbots.
import { useTranslation } from "@engenty/i18n/ui";
import { Label } from "@engenty/ui-core";
import { useAiAgentsQuery } from "../../lib/admin/ai-runtime-queries.js";

export interface RoutineAgentSelectProps {
  id: string;
  onChange: (agentId: string) => void;
  value: string;
}

export function RoutineAgentSelect({
  id,
  value,
  onChange,
}: RoutineAgentSelectProps) {
  const { t } = useTranslation("ai-ui");
  const agentsQuery = useAiAgentsQuery(true);
  const agents = agentsQuery.data?.agents ?? [];

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("routines.form.agent")}</Label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        id={id}
        onChange={(e) => onChange(e.target.value)}
        required
        value={value}
      >
        <option value="">{t("routines.form.agentPlaceholder")}</option>
        {agents
          .filter((agent) => !agent.id.startsWith("chatbot."))
          .map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} ({agent.id})
            </option>
          ))}
      </select>
    </div>
  );
}
