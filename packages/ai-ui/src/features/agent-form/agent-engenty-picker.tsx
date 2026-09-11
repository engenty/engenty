import {
  AGENT_ENGENTY_KINDS,
  type AgentEngentyKind,
} from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, Engenty } from "@engenty/ui-core";

export function AgentEngentyPicker({
  onChange,
  value,
}: {
  onChange: (kind: AgentEngentyKind) => void;
  value: AgentEngentyKind;
}) {
  const { t } = useTranslation("ai-ui");
  return (
    <fieldset className="grid gap-2">
      <legend className="font-medium text-sm">
        {t("agentForm.engentyField")}
      </legend>
      <p className="text-muted-foreground text-xs">
        {t("agentForm.engentyHint")}
      </p>
      <div className="flex flex-wrap gap-2">
        {AGENT_ENGENTY_KINDS.map((kind) => {
          const selected = kind === value;
          return (
            <Button
              aria-pressed={selected}
              className={cn(
                "h-auto flex-col gap-1 px-2 py-2",
                selected && "ring-2 ring-[var(--ember)] ring-offset-2"
              )}
              key={kind}
              onClick={() => onChange(kind)}
              type="button"
              variant={selected ? "secondary" : "outline"}
            >
              <Engenty kind={kind} size={40} />
              <span className="text-xs capitalize">{kind}</span>
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}
