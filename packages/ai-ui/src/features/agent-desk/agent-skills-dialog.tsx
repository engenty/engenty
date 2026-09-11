// Bind or unbind skills on a hired engenty without leaving its desk.
//
// Skills are preferred playbooks: the run loads a bound skill's SKILL.md on
// demand through the workspace `skill` tool, and the catalog floor already
// carries every tool a skill's instructions reach through the catalog. So
// binding a skill needs no tool picker — the only builtin tools outside the
// floor (hiring, space setup) ride with the engenty's place in the space,
// not with a skill. Structure beyond skills keeps its one editor on the
// admin page.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { useUpdateCustomAgentMutation } from "../../lib/admin/ai-runtime-queries.js";
import { SkillPicker } from "../agent-form/skill-picker.js";

export function AgentSkillsDialog({
  agentId,
  onOpenChange,
  open,
  skillIds,
}: {
  agentId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** The skills bound today — the dialog starts from them each time it opens. */
  skillIds: string[];
}) {
  const { t } = useTranslation("ai-ui");
  const update = useUpdateCustomAgentMutation();
  const [draft, setDraft] = useState<string[]>(skillIds);
  useEffect(() => {
    if (open) {
      setDraft(skillIds);
      update.reset();
    }
    // The bound list is the seed, not a live binding — re-seeding on every
    // refetch would throw away an unsaved pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    update.mutate(
      { agentId, patch: { skillIds: draft } },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("agentDesk.manage.skillsDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("agentDesk.manage.skillsDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <SkillPicker onChange={setDraft} value={draft} />
        {update.isError ? (
          <p className="text-destructive text-xs" role="alert">
            {update.error instanceof Error
              ? update.error.message
              : t("agentDesk.manage.saveFailed")}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            disabled={update.isPending}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("agentDesk.manage.skillsCancel")}
          </Button>
          <Button disabled={update.isPending} onClick={save} type="button">
            {t("agentDesk.manage.skillsSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
