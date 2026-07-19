// Edit a channel's topic — opened from the topbar ⋯ menu.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@engenty/ui-core";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSetTopicMutation } from "../queries.js";

export function EditTopicDialog({
  conversationId,
  initialTopic,
  onOpenChange,
  open,
}: {
  conversationId: string;
  initialTopic: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation("team-chat");
  const setTopic = useSetTopicMutation();
  const [draft, setDraft] = useState(initialTopic);

  // Re-seed whenever the dialog opens (topic may have changed meanwhile).
  useEffect(() => {
    if (open) {
      setDraft(initialTopic);
    }
  }, [open, initialTopic]);

  const submit = () => {
    setTopic.mutate(
      { channel: conversationId, topic: draft.trim() },
      {
        onError: (error) =>
          toast.error(t("toasts.actionFailed", { error: String(error) })),
        onSuccess: () => onOpenChange(false),
      }
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialogs.editTopicTitle")}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={t("conversation.topicPlaceholder")}
          value={draft}
        />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} size="sm" variant="ghost">
            {t("dialogs.cancel")}
          </Button>
          <Button disabled={setTopic.isPending} onClick={submit} size="sm">
            {t("dialogs.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
