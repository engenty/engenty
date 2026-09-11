// "Hire from a role" — the first thing on the create-agent page.
//
// It fills the form and gets out of the way: every field a role sets is
// editable directly below, and starting blank is one click. Picking a role is
// not a mode, so there is nothing to undo — the picker just stops being the
// interesting part of the page once a draft exists.
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn } from "@engenty/ui-core";
import { Bot } from "lucide-react";
import {
  AGENT_ROLE_TEMPLATES,
  type AgentRoleTemplate,
} from "./agent-role-templates.js";

interface AgentRolePickerProps {
  onPick: (template: AgentRoleTemplate) => void;
  onStartBlank: () => void;
  /** The role currently reflected in the draft, for the selected state. */
  pickedTemplateId: string | null;
}

export function AgentRolePicker({
  onPick,
  onStartBlank,
  pickedTemplateId,
}: AgentRolePickerProps) {
  const { t } = useTranslation("ai-ui");

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-medium text-sm">{t("agentRoles.title")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("agentRoles.description")}
          </p>
        </div>
        <Button onClick={onStartBlank} size="sm" type="button" variant="ghost">
          {t("agentRoles.startBlank")}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {AGENT_ROLE_TEMPLATES.map((template) => {
          const picked = template.templateId === pickedTemplateId;
          return (
            <button
              className={cn(
                "ui-card-raised flex flex-col gap-1 px-3.5 py-3 text-left",
                picked && "ui-card-selected"
              )}
              key={template.templateId}
              onClick={() => onPick(template)}
              type="button"
            >
              <span className="flex items-center gap-2 font-medium text-sm">
                <Bot
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                {template.name}
              </span>
              <span className="text-muted-foreground text-xs leading-snug">
                {template.hint}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
