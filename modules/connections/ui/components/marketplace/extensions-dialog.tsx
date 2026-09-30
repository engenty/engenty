import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useConnectionSpacesQuery } from "../../hooks/use-connection-space.js";
import type { ConnectionsOwner } from "../../lib/connection-space.js";
import { PluginMarketplace } from "./plugin-marketplace.js";

export type ExtensionsTab = "plugins" | "skills";

/** What a skills tab body gets: the dialog's detail slot, shared with Back. */
export interface ExtensionsSkillsSlot {
  detailsId: string | null;
  onClose: () => void;
  setDetailsId: (id: string | null) => void;
}

export interface ExtensionsDialogProps {
  /** Set when an agent's preferred-plugin list may be edited. */
  agentId?: string | null;
  /** Open straight on one connector's details (its catalog id). */
  initialDetailsId?: string | null;
  initialTab?: ExtensionsTab;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Whose accounts: a Space's, or the viewer's own (`"me"`). */
  owner: ConnectionsOwner;
  /**
   * The Skills tab body — a Space's skill mounts, an agent's skills. Without
   * it the dialog has no tabs (the person's own accounts).
   */
  renderSkills?: (slot: ExtensionsSkillsSlot) => ReactNode;
}

/**
 * The one connect dialog. For a Space: "Extensions", its accounts and plugins
 * (and skills). For the viewer: "My connections", accounts only they and
 * their Copilot use. Space home, Space settings, the agent desk and the
 * Copilot pane all open this.
 */
export function ExtensionsDialog({
  agentId = null,
  initialDetailsId = null,
  initialTab = "plugins",
  onOpenChange,
  open,
  owner,
  renderSkills,
}: ExtensionsDialogProps) {
  const { t } = useTranslation("connections");
  const [tab, setTab] = useState<ExtensionsTab>(initialTab);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const spacesQuery = useConnectionSpacesQuery();
  const spaceOwner = owner === "me" ? null : owner;
  const spaceName =
    spaceOwner?.spaceName ??
    spacesQuery.data?.find((space) => space.id === spaceOwner?.spaceId)?.name ??
    null;
  const resolvedOwner: ConnectionsOwner = spaceOwner
    ? { spaceId: spaceOwner.spaceId, spaceName }
    : "me";
  const tabs = Boolean(renderSkills);

  useEffect(() => {
    if (!open) {
      setDetailsId(null);
      return;
    }
    setTab(initialTab);
    setDetailsId(initialDetailsId);
  }, [initialDetailsId, initialTab, open]);

  const plugins = open ? (
    <PluginMarketplace
      agentId={agentId}
      detailsId={detailsId}
      onDetailsIdChange={setDetailsId}
      owner={resolvedOwner}
    />
  ) : null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={cn(
          "grid h-[min(85vh,42rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-3xl",
          detailsId && "gap-3"
        )}
      >
        <DialogHeader>
          {detailsId ? (
            <Button
              aria-label={t("extensions.back")}
              className="-ml-2"
              onClick={() => setDetailsId(null)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <ArrowLeft />
            </Button>
          ) : null}
          <DialogTitle className={detailsId ? "sr-only" : undefined}>
            {spaceOwner
              ? t("extensions.titleSpace")
              : t("extensions.titleMine")}
          </DialogTitle>
          <DialogDescription className={detailsId ? "sr-only" : undefined}>
            {spaceOwner
              ? t("marketplace.hintNamedSpace", {
                  name: spaceName ?? t("sheet.ownerSpaceUnknown"),
                })
              : t("marketplace.hintOwn")}
          </DialogDescription>
        </DialogHeader>
        {tabs ? (
          <Tabs
            className="flex h-full min-h-0 flex-col"
            onValueChange={(value) => {
              setTab(value as ExtensionsTab);
              setDetailsId(null);
            }}
            value={tab}
          >
            {detailsId ? null : (
              <TabsList className="w-full">
                <TabsTrigger className="flex-1" value="plugins">
                  {t("extensions.tabConnections")}
                </TabsTrigger>
                <TabsTrigger className="flex-1" value="skills">
                  {t("extensions.tabSkills")}
                </TabsTrigger>
              </TabsList>
            )}
            <TabsContent
              className={cn(
                "min-h-0 flex-1 overflow-y-auto pr-1",
                detailsId ? "mt-0" : "mt-3"
              )}
              value="plugins"
            >
              {tab === "plugins" ? plugins : null}
            </TabsContent>
            <TabsContent
              className={cn(
                "min-h-0 flex-1 overflow-y-auto pr-1",
                detailsId ? "mt-0" : "mt-3"
              )}
              value="skills"
            >
              {open && tab === "skills"
                ? renderSkills?.({
                    detailsId,
                    onClose: () => onOpenChange(false),
                    setDetailsId,
                  })
                : null}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="min-h-0 overflow-y-auto pr-1">{plugins}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
