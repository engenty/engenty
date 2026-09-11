// Custom-agent create/edit form: instructions editor + details + capability pickers.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Textarea,
} from "@engenty/ui-core";
import { AgentDetailsFields } from "./agent-details-fields";
import type { AgentDraft } from "./agent-draft";
import { AgentStartersFields } from "./agent-starters-fields";
import type { HireSpaceOption } from "./hire-spaces";
import { SkillPicker } from "./skill-picker";
import { ToolPicker } from "./tool-picker";

interface AgentFormProps {
  draft: AgentDraft;
  error: string | null;
  idReadOnly?: boolean;
  isSaving: boolean;
  lockedSpaceName?: string | null;
  onCancel: () => void;
  onChange: (patch: Partial<AgentDraft>) => void;
  onSubmit: () => void;
  showSpacePicker?: boolean;
  spaces?: HireSpaceOption[];
}

export function AgentForm({
  draft,
  error,
  idReadOnly = false,
  isSaving,
  lockedSpaceName,
  onCancel,
  onChange,
  onSubmit,
  showSpacePicker = false,
  spaces,
}: AgentFormProps) {
  const { t } = useTranslation("ai-ui");
  return (
    <form
      className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Card className="min-h-[34rem]">
        <CardHeader className="pb-3">
          <CardTitle>{t("agentForm.instructions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            className="min-h-[28rem] font-mono text-sm"
            onChange={(event) => onChange({ instructions: event.target.value })}
            placeholder={t("agentForm.instructionsPlaceholder")}
            value={draft.instructions}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <AgentDetailsFields
          draft={draft}
          idReadOnly={idReadOnly}
          lockedSpaceName={lockedSpaceName}
          onChange={onChange}
          showSpacePicker={showSpacePicker}
          spaces={spaces}
        />

        <AgentStartersFields draft={draft} onChange={onChange} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{t("agentForm.skills.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SkillPicker
              onChange={(skillIds) => onChange({ skillIds })}
              value={draft.skillIds}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{t("agentForm.tools.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ToolPicker
              onChange={(toolIds) => onChange({ toolIds })}
              value={draft.toolIds}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{t("agentForm.subAgentsField")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Textarea
              className="min-h-24 font-mono text-sm"
              onChange={(event) =>
                onChange({ subAgentsText: event.target.value })
              }
              value={draft.subAgentsText}
            />
            <p className="text-muted-foreground text-xs">
              {t("agentForm.subAgentsHint")}
            </p>
          </CardContent>
        </Card>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            {t("agentForm.cancel")}
          </Button>
          <Button disabled={isSaving} type="submit">
            {isSaving ? t("agentForm.saving") : t("agentForm.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
