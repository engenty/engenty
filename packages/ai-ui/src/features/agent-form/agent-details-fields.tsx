// Identity fields (id, name, description, model) for the custom-agent form.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@engenty/ui-core";
import type { AgentDraft } from "./agent-draft";
import { AgentEngentyPicker } from "./agent-engenty-picker";
import type { HireSpaceOption } from "./hire-spaces";

export function AgentDetailsFields({
  draft,
  idReadOnly,
  lockedSpaceName,
  onChange,
  showSpacePicker = false,
  spaces = [],
}: {
  draft: AgentDraft;
  idReadOnly: boolean;
  lockedSpaceName?: string | null;
  onChange: (patch: Partial<AgentDraft>) => void;
  showSpacePicker?: boolean;
  spaces?: HireSpaceOption[];
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
        <AgentEngentyPicker
          onChange={(engenty) => onChange({ engenty })}
          value={draft.engenty}
        />
        <div className="grid gap-2">
          <Label htmlFor="agent-form-scope">{t("agentForm.scopeField")}</Label>
          <Select
            onValueChange={(value) =>
              onChange({ agentScope: value as AgentDraft["agentScope"] })
            }
            value={draft.agentScope}
          >
            <SelectTrigger id="agent-form-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">
                {t("agentForm.scopePersonal")}
              </SelectItem>
              <SelectItem value="shared">
                {t("agentForm.scopeShared")}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {t("agentForm.scopeHint")}
          </p>
        </div>
        {lockedSpaceName ? (
          <div className="grid gap-1">
            <p className="font-medium text-sm">{t("agentForm.spacesField")}</p>
            <p className="text-sm">{lockedSpaceName}</p>
            <p className="text-muted-foreground text-xs">
              {t("agentForm.lockedSpaceHint")}
            </p>
          </div>
        ) : null}
        {showSpacePicker ? (
          <fieldset className="grid gap-2">
            <legend className="font-medium text-sm">
              {t("agentForm.spacesField")}
            </legend>
            <p className="text-muted-foreground text-xs">
              {t("agentForm.spacesHint")}
            </p>
            {spaces.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("agentForm.spacesEmpty")}
              </p>
            ) : (
              spaces.map((space) => {
                const checkboxId = `agent-form-space-${space.id}`;
                const checked = draft.spaceIds.includes(space.id);
                return (
                  <div className="flex items-center gap-2" key={space.id}>
                    <Checkbox
                      checked={checked}
                      id={checkboxId}
                      onCheckedChange={(next) => {
                        const selected = new Set(draft.spaceIds);
                        if (next === true) {
                          selected.add(space.id);
                        } else {
                          selected.delete(space.id);
                        }
                        onChange({ spaceIds: [...selected] });
                      }}
                    />
                    <Label htmlFor={checkboxId}>{space.name}</Label>
                  </div>
                );
              })
            )}
          </fieldset>
        ) : null}
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
