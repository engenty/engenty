/**
 * "2 wichtig" beside an agent — its open attention rows (Wichtig) in this
 * space. A click opens the bell on Wichtig narrowed to that agent, never the
 * row or card it sits on.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { openNotificationInbox } from "@engenty/notifications-ui";
import { cn } from "@engenty/ui-core";

export function AgentAttentionPill({
  agentId,
  agentName,
  className,
  count,
}: {
  agentId: string;
  agentName: string;
  className?: string;
  count: number;
}) {
  const { t } = useTranslation("common");
  if (count <= 0) {
    return null;
  }
  return (
    <button
      className={cn(
        "pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-ember-tint px-1.5 py-0.5 font-semibold text-[10px] text-ember-strong leading-none hover:underline",
        className
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openNotificationInbox({
          actor: { id: agentId, label: agentName },
          lane: "attention",
        });
      }}
      type="button"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-ember-strong" />
      {t("spaces.agents.attention", {
        count,
        defaultValue: "{{count}} important",
      })}
    </button>
  );
}
