// Identity fields (id, name, description, model) for the custom-agent form.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@engenty/ui-core";
import type { AgentDraft } from "./agent-draft";

export function AgentDetailsFields({
  draft,
  idReadOnly,
  onChange,
}: {
  draft: AgentDraft;
  idReadOnly: boolean;
  onChange: (patch: Partial<AgentDraft>) => void;
}) {
  const { t } = useTranslation("ai-ui");
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{t("agentForm.detailsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="agent-form-id">{t("agentForm.idField")}</Label>
          <Input
            autoComplete="off"
            id="agent-form-id"
            onChange={(event) => onChange({ id: event.target.value })}
            readOnly={idReadOnly}
            value={draft.id}
          />
          <p className="text-muted-foreground text-xs">
            {t("agentForm.idHint")}
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="agent-form-name">{t("agentForm.nameField")}</Label>
          <Input
            autoComplete="off"
            id="agent-form-name"
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder={t("agentForm.namePlaceholder")}
            value={draft.name}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="agent-form-description">
            {t("agentForm.descriptionField")}
          </Label>
          <Textarea
            id="agent-form-description"
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder={t("agentForm.descriptionPlaceholder")}
            value={draft.description}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="agent-form-model">{t("agentForm.modelField")}</Label>
          <Input
            autoComplete="off"
            id="agent-form-model"
            onChange={(event) => onChange({ model: event.target.value })}
            placeholder={t("agentForm.modelPlaceholder")}
            value={draft.model}
          />
        </div>
      </CardContent>
    </Card>
  );
}
