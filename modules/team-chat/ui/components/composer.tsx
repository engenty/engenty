import { useTranslation } from "@engenty/i18n/ui";
import { Button, Textarea } from "@engenty/ui-core";
import { SendHorizonal } from "lucide-react";
import { useState } from "react";

export interface ComposerProps {
  disabled?: boolean;
  onSend: (text: string) => Promise<void> | void;
  placeholder: string;
  sending?: boolean;
}

export function Composer({
  disabled = false,
  onSend,
  placeholder,
  sending = false,
}: ComposerProps) {
  const { t } = useTranslation("team-chat");
  const [text, setText] = useState("");
  const canSend = !(disabled || sending) && text.trim().length > 0;

  const submit = () => {
    const value = text.trim();
    if (!(canSend && value)) {
      return;
    }
    setText("");
    void onSend(value);
  };

  return (
    <div className="border-border/60 border-t bg-card px-4 py-3">
      <div className="ui-canvas-field flex items-end gap-2 p-1.5">
        <Textarea
          className="max-h-40 min-h-9 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          rows={1}
          value={text}
        />
        <Button
          aria-label={t("composer.send")}
          disabled={!canSend}
          onClick={submit}
          size="icon"
          variant={canSend ? "default" : "ghost"}
        >
          <SendHorizonal className="size-4" />
        </Button>
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted-foreground">
        {t("composer.hint")}
      </p>
    </div>
  );
}
