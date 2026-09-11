/**
 * Roster empty state on `/s/<key>/agents`. Ask AI opens Copilot; Add opens
 * the same menu as the sidebar "+" (new agent, new group chat).
 */
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Engenty,
} from "@engenty/ui-core";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export function SpaceAgentsEmpty({
  hireAction,
  onAskAi,
}: {
  hireAction?: ReactNode;
  onAskAi?: () => void;
}) {
  const { t } = useTranslation("common");
  const hasActions = Boolean(onAskAi || hireAction);

  return (
    <Empty className="border border-border border-dashed py-16">
      <EmptyHeader>
        <EmptyMedia className="size-14 bg-muted/70" variant="icon">
          <Engenty className="[&_.e-shadow]:hidden" kind="round" size={36} />
        </EmptyMedia>
        <EmptyTitle>
          {t("spaces.agents.emptyTitle", {
            defaultValue: "Create your first agent",
          })}
        </EmptyTitle>
        <EmptyDescription>
          {t("spaces.agents.emptyDescription", {
            defaultValue:
              "Hire an Engenty with a short wizard, or ask Copilot to set one up.",
          })}
        </EmptyDescription>
      </EmptyHeader>
      {hasActions ? (
        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onAskAi ? (
              <Button onClick={onAskAi}>
                <Sparkles className="mr-1.5 size-3.5" />
                {t("spaces.agents.askAi", {
                  defaultValue: "Ask AI",
                })}
              </Button>
            ) : null}
            {hireAction}
          </div>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
