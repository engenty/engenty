/**
 * Space hire wizard — Super Grok's create screen, in Engenty clothes.
 *
 * One focused step: character (our engenty kinds, colour bound to silhouette),
 * name, description, then Get started. Role templates sit underneath as
 * Suggestions. No "label" field — we do not have a use for one yet.
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@engenty/ui-core";
import { useNavigate } from "react-router-dom";
import { spaceAgentDeskPath } from "@/lib/space-routes";
import {
  SpaceAgentHireFields,
  useSpaceAgentHireForm,
} from "./SpaceAgentHireForm";
import type { SpaceAgentHireDraft } from "./space-agent-hire";

export function SpaceAgentHireWizard({
  initial,
  onOpenChange,
  open,
  spaceId,
  spaceKey,
}: {
  /** Seeds the form — e.g. who the hire reports to, from a coordinator's row. */
  initial?: SpaceAgentHireDraft | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  spaceId: string;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const form = useSpaceAgentHireForm({
    active: open,
    ...(initial ? { initial } : {}),
    spaceId,
  });

  const submit = async () => {
    const agentId = await form.submit();
    if (!agentId) {
      return;
    }
    onOpenChange(false);
    navigate(spaceAgentDeskPath(spaceKey, agentId), { replace: true });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-y-auto sm:max-w-lg">
        <DialogTitle className="sr-only">
          {t("spaces.agents.wizard.title", { defaultValue: "New agent" })}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("spaces.agents.wizard.srHint", {
            defaultValue:
              "Choose a character, name the Engenty, and describe the job it should own in this space.",
          })}
        </DialogDescription>
        <SpaceAgentHireFields form={form}>
          <Button
            className="w-full"
            disabled={!form.canSubmit || form.isPending}
            onClick={() => void submit()}
            type="button"
          >
            {form.isPending
              ? t("spaces.agents.wizard.creating", {
                  defaultValue: "Creating…",
                })
              : t("spaces.agents.wizard.getStarted", {
                  defaultValue: "Get started",
                })}
          </Button>
        </SpaceAgentHireFields>
      </DialogContent>
    </Dialog>
  );
}
