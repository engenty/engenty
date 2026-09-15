/**
 * The space home's empty hire card — shown when nobody has hired an Engenty
 * yet. Same raised shape as a conversation card, so the column is not blank.
 */
import { useTranslation } from "@engenty/i18n/ui";
import { Button, Engenty } from "@engenty/ui-core";
import { useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { useState } from "react";
import { SpaceAgentHireWizard } from "@/components/spaces/SpaceAgentHireWizard";
import type { Space } from "@/lib/api/spaces-client";
import { SpaceHomeSectionHeading } from "./SpaceHomeSectionHeading";

export function SpaceHomeHireEmptyCard({ space }: { space: Space }) {
  const { t } = useTranslation("common");
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const canHire = Boolean(isTenantAdmin || isSuperAdmin || space.ownerUserId);
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <section className="flex flex-col">
      <SpaceHomeSectionHeading>
        {t("spaces.home.sections.agents", { defaultValue: "Agents" })}
      </SpaceHomeSectionHeading>
      <div
        className="ui-card-raised flex items-start gap-3.5 rounded-[14px] px-4 py-3.5"
        data-testid="space-home-hire-empty"
      >
        <div className="shrink-0 pt-0.5">
          <Engenty kind="round" size={38} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <header className="flex min-w-0 flex-col gap-0.5">
            <h2 className="font-semibold text-[15px]">
              {t("spaces.home.emptyHire.title", {
                defaultValue: "Hire an Engenty",
              })}
            </h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {t("spaces.home.emptyHire.body", {
                defaultValue:
                  "An Engenty is a teammate you hire into this space. It owns a standing job here — watching work, keeping records, drafting — and works with the apps you mount.",
              })}
            </p>
          </header>
          {canHire ? (
            <div>
              <Button onClick={() => setWizardOpen(true)} size="sm">
                {t("spaces.home.emptyHire.action", {
                  defaultValue: "Hire an Engenty",
                })}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <SpaceAgentHireWizard
        onOpenChange={setWizardOpen}
        open={wizardOpen}
        spaceId={space.id}
        spaceKey={space.key}
      />
    </section>
  );
}
