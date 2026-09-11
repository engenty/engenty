import { AGENT_STARTER_MAX } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@engenty/ui-core";
import type { AgentDraft, AgentDraftStarter } from "./agent-draft";

const EMPTY_STARTER: AgentDraftStarter = {
  id: "",
  label: "",
  labelDe: "",
  prompt: "",
  promptDe: "",
};

export function AgentStartersFields({
  draft,
  onChange,
}: {
  draft: AgentDraft;
  onChange: (patch: Partial<AgentDraft>) => void;
}) {
  const { t } = useTranslation("ai-ui");
  const starters = draft.starters;
  const updateAt = (index: number, patch: Partial<AgentDraftStarter>) => {
    onChange({
      starters: starters.map((starter, starterIndex) =>
        starterIndex === index ? { ...starter, ...patch } : starter
      ),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{t("agentForm.starters.title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-muted-foreground text-xs">
          {t("agentForm.starters.hint")}
        </p>
        {starters.map((starter, index) => (
          <fieldset
            className="grid gap-2 rounded-md border p-3"
            key={`starter-${String(index)}`}
          >
            <div className="flex items-center justify-between gap-2">
              <legend className="font-medium text-sm">
                {t("agentForm.starters.item", { index: index + 1 })}
              </legend>
              <Button
                onClick={() =>
                  onChange({
                    starters: starters.filter(
                      (_, starterIndex) => starterIndex !== index
                    ),
                  })
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("agentForm.starters.remove")}
              </Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`agent-form-starter-id-${String(index)}`}>
                {t("agentForm.starters.idField")}
              </Label>
              <Input
                autoComplete="off"
                id={`agent-form-starter-id-${String(index)}`}
                onChange={(event) =>
                  updateAt(index, { id: event.target.value })
                }
                value={starter.id}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`agent-form-starter-label-${String(index)}`}>
                {t("agentForm.starters.labelField")}
              </Label>
              <Input
                autoComplete="off"
                id={`agent-form-starter-label-${String(index)}`}
                maxLength={48}
                onChange={(event) =>
                  updateAt(index, { label: event.target.value })
                }
                value={starter.label}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`agent-form-starter-prompt-${String(index)}`}>
                {t("agentForm.starters.promptField")}
              </Label>
              <Textarea
                id={`agent-form-starter-prompt-${String(index)}`}
                maxLength={400}
                onChange={(event) =>
                  updateAt(index, { prompt: event.target.value })
                }
                value={starter.prompt}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`agent-form-starter-label-de-${String(index)}`}>
                {t("agentForm.starters.labelDeField")}
              </Label>
              <Input
                autoComplete="off"
                id={`agent-form-starter-label-de-${String(index)}`}
                maxLength={48}
                onChange={(event) =>
                  updateAt(index, { labelDe: event.target.value })
                }
                value={starter.labelDe}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`agent-form-starter-prompt-de-${String(index)}`}>
                {t("agentForm.starters.promptDeField")}
              </Label>
              <Textarea
                id={`agent-form-starter-prompt-de-${String(index)}`}
                maxLength={400}
                onChange={(event) =>
                  updateAt(index, { promptDe: event.target.value })
                }
                value={starter.promptDe}
              />
            </div>
          </fieldset>
        ))}
        {starters.length < AGENT_STARTER_MAX ? (
          <Button
            onClick={() => onChange({ starters: [...starters, EMPTY_STARTER] })}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("agentForm.starters.add")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
