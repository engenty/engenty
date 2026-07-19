import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@engenty/ui-core";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useCreateChannelMutation } from "../queries.js";

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export function NewChannelDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { t } = useTranslation("team-chat");
  const navigate = useNavigate();
  const create = useCreateChannelMutation();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const normalized = name.trim().toLowerCase().replace(/\s+/g, "-");
  const valid = NAME_PATTERN.test(normalized);

  const submit = () => {
    if (!valid) {
      return;
    }
    create.mutate(
      {
        is_private: isPrivate,
        name: normalized,
        ...(topic.trim() ? { topic: topic.trim() } : {}),
      },
      {
        onError: (error) => {
          toast.error(
            String(error).includes("channel_exists")
              ? t("toasts.channelExists")
              : t("toasts.actionFailed", { error: String(error) })
          );
        },
        onSuccess: (conversation) => {
          toast.success(t("toasts.channelCreated"));
          onOpenChange(false);
          setName("");
          setTopic("");
          setIsPrivate(false);
          navigate(`/mdl/team-chat/${conversation.id}`);
        },
      }
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialogs.createChannelTitle")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="team-chat-channel-name">
              {t("dialogs.channelName")}
            </Label>
            <Input
              autoFocus
              id="team-chat-channel-name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="project-apollo"
              value={name}
            />
            <p className="text-muted-foreground text-xs">
              {t("dialogs.channelNameHint")}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="team-chat-channel-topic">
              {t("dialogs.channelTopic")}
            </Label>
            <Input
              id="team-chat-channel-topic"
              onChange={(event) => setTopic(event.target.value)}
              value={topic}
            />
          </div>
          <label className="flex items-start gap-2">
            <Checkbox
              checked={isPrivate}
              onCheckedChange={(checked) => setIsPrivate(checked === true)}
            />
            <span className="flex flex-col">
              <span className="text-sm">{t("dialogs.privateChannel")}</span>
              <span className="text-muted-foreground text-xs">
                {t("dialogs.privateChannelHint")}
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            {t("dialogs.cancel")}
          </Button>
          <Button disabled={!valid || create.isPending} onClick={submit}>
            {t("dialogs.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
