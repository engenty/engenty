import { CHAT_STYLES, type ChatStyle } from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { SettingsFormSection } from "@engenty/ui-core";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppearanceChatSectionProps {
  onChange: (style: ChatStyle) => void;
  value: string;
}

/** A tiny transcript: the person's bubble, then the agent's answer. */
function ChatStyleIllustration({ style }: { style: ChatStyle }) {
  const agentLines = (
    <>
      <div className="h-1.5 w-20 rounded-full bg-muted-foreground/40" />
      <div className="h-1.5 w-24 rounded-full bg-muted-foreground/40" />
      <div className="h-1.5 w-14 rounded-full bg-muted-foreground/40" />
    </>
  );
  return (
    <div className="flex h-24 w-full flex-col gap-2 rounded-md border border-border bg-background p-2.5">
      <div className="ml-auto flex w-16 flex-col gap-1 rounded-xl rounded-br-sm bg-primary/20 px-2 py-1.5">
        <div className="h-1.5 w-full rounded-full bg-primary/50" />
      </div>
      {style === "bubbles" ? (
        <div className="flex items-end gap-1.5">
          <div className="size-4 shrink-0 rounded-full bg-primary/60" />
          <div className="flex w-fit flex-col gap-1 rounded-xl bg-foreground/10 px-2 py-1.5">
            {agentLines}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1 px-0.5">{agentLines}</div>
      )}
    </div>
  );
}

export function AppearanceChatSection({
  value,
  onChange,
}: AppearanceChatSectionProps) {
  const { t } = useTranslation("common");

  return (
    <SettingsFormSection
      description={t("settings.chatUiDescription")}
      title={t("settings.chatUi")}
    >
      <div className="grid grid-cols-2 gap-3 pt-2 sm:pt-0">
        {CHAT_STYLES.map((style) => {
          const isActive =
            (value === "bubbles" ? "bubbles" : "canvas") === style;
          return (
            <button
              className={cn(
                "relative flex flex-col items-center gap-3 rounded-lg border p-4 transition-colors",
                isActive
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-accent"
              )}
              key={style}
              onClick={() => onChange(style)}
              type="button"
            >
              <ChatStyleIllustration style={style} />
              <span className="font-medium text-sm">
                {t(
                  style === "bubbles"
                    ? "settings.chatStyleBubbles"
                    : "settings.chatStyleCanvas"
                )}
              </span>
              {isActive && (
                <div className="absolute top-2 right-2">
                  <Check className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </SettingsFormSection>
  );
}
