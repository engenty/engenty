/**
 * The space level of the sidebar: Work · Data · Plan, plus Work's module list.
 *
 * Rendered into the shell's secondary column through `secondaryNavLeadingSlot`,
 * ABOVE whatever the open module contributes. That is what makes the space one
 * column with two levels instead of two columns: the space's sections on top,
 * the module's own nav — the very same `mdl/tasks` or knowledge-base sidebar,
 * untouched — directly below.
 *
 * Work lists the space's MOUNTS, not the installed modules, so the list answers
 * "what is in this space" rather than "what does this tenant own". Data and any
 * plugin space tab (Plan) are left out of it: they have their own tab.
 *
 * Copilot is a Work-list row that drills into its own sidebar, same as any
 * other mount — not a mix-in of its chats under the space column.
 *
 * The inbox — the shell's notification centre narrowed to this space — is no
 * longer a row here: it is the dashboard's bell, and Work's first row is the
 * Dashboard itself. Its unseen count still shows in both places (and on Plan
 * while that tab exists), because a space without Tasks still receives
 * approvals, questions and reports.
 */
import { useInboxUnseenCountQuery } from "@engenty/ai-ui/embed";
import { useTranslation } from "@engenty/i18n/ui";
import { useSpaceNeedsInputCount } from "@engenty/notifications-ui";
import { cn } from "@engenty/ui-core";
import {
  type SpaceResourceKind,
  useUiContributions,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import {
  Database,
  LayoutDashboard,
  LayoutGrid,
  SquareCheck,
} from "lucide-react";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { SpaceArtifactsSection } from "@/components/spaces/SpaceArtifactsSection";
import { SpaceConversationSections } from "@/components/spaces/SpaceConversationSections";
import { SpaceCopilotWorkRows } from "@/components/spaces/SpaceCopilotWorkRows";
import { SpaceDataTree } from "@/components/spaces/SpaceDataTree";
import { SpaceMembersSection } from "@/components/spaces/SpaceMembersSection";
import { SpaceModulesSection } from "@/components/spaces/SpaceModulesSection";
import { SpaceMountsDialog } from "@/components/spaces/SpaceMountsDialog";
import { NavCountBadge, SpaceNavRow } from "@/components/spaces/space-nav-row";
import type { Space } from "@/lib/api/spaces-client";
import { type SpaceSectionId, spaceTabModuleId } from "@/lib/space-nav";
import {
  isSpaceDashboardBoundPath,
  spaceDataPath,
  spaceModulePath,
  spaceRootPath,
} from "@/lib/space-routes";
import {
  useSpaceListedModules,
  useSpaceModules,
} from "@/lib/use-space-modules";

interface SpaceSection {
  icon: ComponentType<{ className?: string }>;
  id: SpaceSectionId;
  label: string;
  to: string;
}

export function SpaceNavTabs({
  activeModuleId,
  isPersonal,
  section,
  space,
  spaceId,
  spaceKey,
}: {
  activeModuleId: string | undefined;
  /**
   * A personal space, which has no roster at all — `owner_user_id` is its whole
   * access grant and the database refuses a member row on one. The People list
   * is suppressed entirely rather than rendered empty.
   */
  isPersonal: boolean;
  section: SpaceSectionId;
  space: Space | null;
  spaceId: string | null;
  spaceKey: string;
}) {
  const { t } = useTranslation("common");
  const { contributions } = useUiContributions();
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const { modules: mounted, isPending } = useSpaceModules(spaceId);
  const inboxUnseenQuery = useInboxUnseenCountQuery();
  // Inside a space the tab counts what waits here (tenant-global rows
  // included); the tenant-wide number is the bell's.
  const inboxCount =
    inboxUnseenQuery.data?.in_space ?? inboxUnseenQuery.data?.total ?? 0;
  // The Dashboard's own badge counts what still WAITS for a person here, not
  // what is unread: an approval you looked at yesterday and left open is the
  // whole reason to put a number on the row.
  const needsInputCount = useSpaceNeedsInputCount();
  const canManage = Boolean(isTenantAdmin || isSuperAdmin);
  // Personal-space owners may mount modules and agents (admins cannot see
  // those spaces). Adding people is admin-only, and only on shared spaces.
  const canEdit = canManage || isPersonal;
  const [editingKind, setEditingKind] = useState<SpaceResourceKind | null>(
    null
  );
  const mountedIds = useMemo(
    () => new Set(mounted.map((module) => module.id)),
    [mounted]
  );
  const copilotApps = useMemo(
    () =>
      (contributions.copilotApps ?? []).filter((app) =>
        mountedIds.has(app.pluginId)
      ),
    [contributions.copilotApps, mountedIds]
  );
  const pluginTabs = useMemo(
    () =>
      [...(contributions.spaceTabs ?? [])]
        .filter((tab) => mountedIds.has(spaceTabModuleId(tab)))
        .sort((left, right) => (left.order ?? 100) - (right.order ?? 100)),
    [contributions.spaceTabs, mountedIds]
  );
  const promotedIds = useMemo(
    () => new Set(pluginTabs.map((tab) => spaceTabModuleId(tab))),
    [pluginTabs]
  );
  const sections: SpaceSection[] = useMemo(
    () => [
      {
        icon: LayoutGrid,
        id: "work",
        label: t("spaces.tabs.work", { defaultValue: "Work" }),
        to: spaceRootPath(spaceKey),
      },
      {
        // A database, not the prototype's folder: Data outgrew the Drive the
        // moment it stopped meaning files. It is one tree over the space's
        // files, its connected folders, its projects and the RECORDS of every
        // mounted module — a folder icon would promise a file tree that is only
        // one part of it.
        icon: Database,
        id: "data",
        label: t("spaces.tabs.data", { defaultValue: "Data" }),
        to: spaceDataPath(spaceKey),
      },
      ...pluginTabs.map((tab) => {
        const moduleId = spaceTabModuleId(tab);
        return {
          icon: tab.icon ?? SquareCheck,
          id: tab.id,
          label: tab.labelKey
            ? t(tab.labelKey, { defaultValue: tab.label ?? tab.id })
            : (tab.label ?? tab.id),
          to: spaceModulePath(spaceKey, moduleId, tab.path),
        };
      }),
    ],
    [pluginTabs, spaceKey, t]
  );

  // What Modules lists — a tab-owning module and an assistant module are both
  // filed elsewhere. Shared with the home's Module column.
  const { modules } = useSpaceListedModules(spaceId);
  const location = useLocation();
  const dashboardHref = spaceRootPath(spaceKey);
  // The home is the one row whose page has no module segment: an exact match,
  // so /s/<key>/agents does not light it up too. The inbox is the exception —
  // it is the dashboard's list, so the row stays selected there.
  const dashboardActive =
    location.pathname === dashboardHref ||
    isSpaceDashboardBoundPath(location.pathname, spaceKey);

  return (
    <div className="flex flex-col gap-3">
      {/* Icon over an uppercase label, per the Concept A prototype. Work and
          Data are host furniture; plugin tabs (Plan, …) sit beside them only
          while that module is mounted. The active one reads as a raised card
          in the accent colour rather than merely a darker word. */}
      {/* Concentric radii: the active card's corner must equal the container's
          minus its padding (12 − 4 = 8), or the inner corner looks rounder than
          the outer one it sits in. Gap is 0 for the same reason a segmented
          control has none — the cells are one object, not three. */}
      <div className="flex items-stretch rounded-[12px] bg-muted p-1">
        {sections.map((item) => {
          const Icon = item.icon;
          const isActive = section === item.id;
          const planBadge = item.id === "plan" ? inboxCount : 0;
          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              aria-label={
                planBadge > 0
                  ? t("spaces.tabs.planWithCount", {
                      count: planBadge,
                      defaultValue: "Plan, {{count}} in inbox",
                    })
                  : undefined
              }
              className={cn(
                // Tighter under the label than over the icon: the uppercase
                // label has no descenders, so symmetric padding reads as a gap
                // below it.
                "relative flex flex-1 flex-col items-center gap-0.5 rounded-[8px] px-1 pt-1.5 pb-1 transition",
                isActive
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              key={item.id}
              to={item.to}
            >
              <Icon aria-hidden className="size-4" />
              <span
                className={cn(
                  "font-semibold text-[11px] uppercase tracking-wide",
                  isActive ? "text-primary" : "text-current"
                )}
              >
                {item.label}
              </span>
              <NavCountBadge
                className="absolute top-0.5 right-0.5"
                count={planBadge}
              />
            </Link>
          );
        })}
      </div>

      {section === "work" ? (
        <div className="flex flex-col gap-3">
          {/* Favoriten sit where Inbox used to lead; Inbox stays the first
              list row under them; then this person's sections and the
              built-ins. One component, because dragging a row into Favoriten
              crosses the Dashboard row. Copilot sits beside Dashboard as the
              door into its module sidebar — not its chats mixed into this list. */}
          <SpaceConversationSections
            canAdd={canEdit}
            canManage={canEdit}
            spaceId={spaceId}
            spaceKey={spaceKey}
          >
            <div className="flex flex-col">
              {/* The home, by name. Inbox left this list for the dashboard's
                  own bell: what waits for you is one destination, and it now
                  sits where you land rather than a row above the roster. The
                  count comes along — the row still has to say that something
                  is waiting, and it is the SAME number the bell shows. */}
              <SpaceNavRow
                active={dashboardActive}
                badge={needsInputCount}
                href={dashboardHref}
                icon={LayoutDashboard}
                label={t("spaces.dashboard", { defaultValue: "Dashboard" })}
              />
              {copilotApps.length > 0 ? (
                <SpaceCopilotWorkRows
                  activeModuleId={activeModuleId}
                  apps={copilotApps}
                  spaceKey={spaceKey}
                />
              ) : null}
            </div>
          </SpaceConversationSections>
          {/* The space's own things, after its conversations and before the
              modules that produce records: a pinned artifact is at hand the
              way a favourite conversation is. */}
          <SpaceArtifactsSection spaceId={spaceId} spaceKey={spaceKey} />
          <SpaceModulesSection
            activeModuleId={activeModuleId}
            canAdd={canEdit}
            isPending={isPending}
            modules={modules}
            onAdd={() => setEditingKind("module")}
            spaceKey={spaceKey}
          />
          {/* People remain last. A personal space shows its owner as the sole
              person, but cannot accept member rows or offer an add action. */}
          <SpaceMembersSection
            canAdd={canManage && !isPersonal}
            canManage={false}
            personalOwnerLabel={isPersonal ? space?.name : undefined}
            spaceId={spaceId}
            spaceKey={spaceKey}
          />
        </div>
      ) : null}

      {/* Data's list is a TREE, and it belongs in the same column for the same
          reason the Work list does: both answer "what is in this space", and
          both are how you get to it. The pane on the right then belongs
          entirely to whatever is selected. */}
      {section === "data" ? (
        <SpaceDataTree spaceId={spaceId} spaceKey={spaceKey} />
      ) : null}

      <SpaceMountsDialog
        kind={editingKind}
        onOpenChange={(open) => {
          if (!open) {
            setEditingKind(null);
          }
        }}
        open={editingKind != null}
        space={space}
      />
    </div>
  );
}
