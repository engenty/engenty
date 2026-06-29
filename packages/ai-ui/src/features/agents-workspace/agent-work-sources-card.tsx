// "How work reaches it" card (ui-6 §3): actions dispatching to this agent
// and the static assignable-in-tasks hint. Routines targeting this agent are
// managed in the dedicated AgentRoutinesTriggerCard (ui-2 §3).

import { SettingsFormSection } from "@engenty/ui-core";
import { ClipboardList, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import type { AiRegisteredAction } from "../../lib/admin/ai-runtime-api";
import { buildActionDetailPath } from "./agent-workspace-url-state";

function GroupHeading(props: { label: string }) {
  return (
    <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      {props.label}
    </p>
  );
}

export function AgentWorkSourcesCard({
  actions,
  t,
}: {
  actions: AiRegisteredAction[];
  t: (key: string) => string;
}) {
  return (
    <SettingsFormSection
      description={t("agentDetail.workSourcesDescription")}
      title={t("agentDetail.workSourcesTitle")}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <GroupHeading label={t("agentDetail.workSourcesActions")} />
          {actions.length ? (
            <ul className="m-0 list-none space-y-1 p-0">
              {actions.map((action) => (
                <li className="flex items-start gap-2" key={action.id}>
                  <Zap
                    aria-hidden
                    className="mt-1 size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                  <div className="min-w-0">
                    <Link
                      className="break-words font-medium text-sm transition-colors hover:text-primary"
                      to={buildActionDetailPath(action.id)}
                    >
                      {action.name}
                    </Link>
                    {action.description ? (
                      <p className="break-words text-muted-foreground text-xs">
                        {action.description}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("agentDetail.workSourcesActionsEmpty")}
            </p>
          )}
        </div>

        <p className="flex items-start gap-2 text-muted-foreground text-sm">
          <ClipboardList
            aria-hidden
            className="mt-0.5 size-3.5 shrink-0"
            strokeWidth={1.75}
          />
          {t("agentDetail.workSourcesTasksHint")}
        </p>
      </div>
    </SettingsFormSection>
  );
}
