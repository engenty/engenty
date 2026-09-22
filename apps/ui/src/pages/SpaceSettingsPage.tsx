/**
 * A space's settings — ONE page at `/s/<key>/settings` (PLAN-spaces.md Phase 4).
 *
 * **Settings, not contents.** The first cut also carried the Drive tree and the
 * files module's contributed tab, which is how a settings page turns into a
 * second home screen: neither is a setting, both are things you go into the
 * space to USE. What belongs here is what the space IS (name, colour, who is in
 * it) and what it CONTAINS (its mounts) — nothing you would open twice a day.
 *
 * **The mount cards are the choosers.** Apps is the module chooser, Engentys the
 * agent chooser; a count badge told you a number and left the actual question —
 * which ones — to a dialog. So each card lists what is mounted, in the same
 * avatar/icon-row idiom `/settings` uses, and its footer opens the picker.
 *
 * Colour and icon are edited from the tile itself — an edit pen on hover, the
 * same move tenant settings makes on its logo — rather than from a card in the
 * column: the palette is the least-used thing here and was sitting above the
 * things people came for.
 */
import {
  type AgentEngentyKind,
  resolveAgentEngenty,
} from "@engenty/ai-core/browser";
import { UserBrowserView, useEffectiveAiSettingsQuery } from "@engenty/ai-ui";
import { SpaceIconFace } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  AGENT_APPROVAL_MODES,
  type AgentApprovalMode,
  COMPUTER_NETWORK_TIERS,
  type ComputerNetworkTier,
  parseAgentApprovalMode,
  parseComputerNetworkTier,
} from "@engenty/plugin-sdk";
import { useMutation, useQuery, useQueryClient } from "@engenty/query-client";
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EditableText,
  Engenty,
  SettingsFormSection,
  Skeleton,
  Switch,
} from "@engenty/ui-core";
import {
  type SpaceResourceKind,
  type UiIconComponent,
  usePageConfig,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import {
  Boxes,
  ChevronRight,
  Globe,
  Pencil,
  Plug,
  Plus,
  Settings2,
  Terminal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { SettingsOverviewIcon } from "@/components/settings";
import { SpaceAppearanceDialog } from "@/components/spaces/SpaceAppearanceDialog";
import type { SpaceAppearanceValue } from "@/components/spaces/SpaceAppearanceFields";
import { SpaceDangerZone } from "@/components/spaces/SpaceDangerZone";
import { SpaceMembersCard } from "@/components/spaces/SpaceMembersCard";
import { SpaceMountsDialog } from "@/components/spaces/SpaceMountsDialog";
import { connectionMetaById } from "@/components/spaces/space-mount-catalog";
import type { SpaceMount } from "@/lib/api/spaces-client";
import {
  getSpaceBrowserGrant,
  putSpaceBrowserGrant,
  readUserBrowser,
  signOutUserBrowser,
  startUserBrowser,
  stopUserBrowser,
} from "@/lib/api/spaces-client";
import {
  resolveSpaceAgentKind,
  type SpaceAgentKind,
} from "@/lib/space-agent-nav";
import {
  SPACE_SETTINGS_PEOPLE_HASH,
  spaceModulePath,
} from "@/lib/space-routes";
import {
  useSaveSpaceSetupMutation,
  useSpaceAgentCatalogQuery,
  useSpaceConnectorCatalogQuery,
  useSpaceMountsQuery,
  useSpaceSetupCatalogQuery,
  useSpaceSkillCatalogQuery,
  useSpacesQuery,
} from "@/lib/spaces-queries";
import { useSpaceModules } from "@/lib/use-space-modules";

interface MountRow {
  access?: "none" | "read" | "write" | null;
  description?: string | null;
  /**
   * The agent's own blob face, shown instead of {@link MountRow.icon}. An
   * engenty is recognised by its face everywhere else in the app; a generic
   * robot glyph here made the roster the one place it is not.
   */
  engenty?: AgentEngentyKind;
  /** Fallback mark for rows that have no face of their own (modules, skills). */
  icon?: UiIconComponent;
  id: string;
  label: string;
  /** Present when the row is reachable inside the space. */
  to?: string;
}

/** One row of a mount card — a link where the thing can be opened, plain text otherwise. */
function MountRowItem({ row }: { row: MountRow }) {
  const { t } = useTranslation("common");
  const body = (
    <>
      {row.engenty ? (
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center overflow-visible"
        >
          <Engenty
            className="[&_.e-shadow]:hidden"
            kind={row.engenty}
            size={30}
          />
        </span>
      ) : row.icon ? (
        <SettingsOverviewIcon Icon={row.icon} />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-foreground text-sm">
          {row.label}
        </span>
        {row.description ? (
          <span className="truncate text-muted-foreground text-xs">
            {row.description}
          </span>
        ) : null}
      </div>
      {/* Whose access this is, said out loud: a bare "No access" chip beside a
          module reads as "you cannot open this", when it means the space's
          engentys may not touch that module's records. */}
      {row.access ? (
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-muted-foreground text-xs">
            {t("spaces.setup.agentsTitle")}
          </span>
          <Badge variant="secondary">
            {t(`spaces.setup.access.${row.access}`)}
          </Badge>
        </span>
      ) : null}
    </>
  );
  if (row.to) {
    return (
      <Link
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
        to={row.to}
      >
        {body}
      </Link>
    );
  }
  return <div className="flex items-center gap-3 px-4 py-3">{body}</div>;
}

/**
 * A labelled run of rows inside one card.
 *
 * Agents are the only kind that needs this: a flat list makes a delegated
 * sub-agent look like a peer of a hired Engenty, and makes rows the server
 * refuses to unmount look removable. Every other card passes plain `rows`.
 */
interface MountSection {
  /** Starts collapsed behind a count — for rows nobody addresses directly. */
  collapsible?: boolean;
  description?: string;
  id: string;
  label: string;
  rows: MountRow[];
}

/** Flush card body: rows, an empty state, and one footer action that opens the picker. */
function MountCard({
  action,
  isPending,
  onConfigure,
  rows,
  sections,
  secondaryAction,
}: {
  action: string;
  isPending: boolean;
  onConfigure: (() => void) | null;
  rows?: MountRow[];
  /**
   * A second footer entry, for the case the picker cannot serve: choosing from
   * what exists is one job, bringing something new into existence is another.
   * Only Connections has one today — "Add account" (CN.4 Flow A).
   */
  secondaryAction?: { label: string; to: string } | null;
  /** Grouped rows. Wins over `rows`; see {@link MountSection}. */
  sections?: MountSection[];
}) {
  const { t } = useTranslation("common");
  const groups = useMemo(
    () => sections ?? [{ id: "all", label: "", rows: rows ?? [] }],
    [rows, sections]
  );
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        (sections ?? [])
          .filter((section) => section.collapsible)
          .map((section) => section.id)
      )
  );
  const rowCount = groups.reduce(
    (total, group) => total + group.rows.length,
    0
  );
  return (
    <div>
      {isPending
        ? [0, 1].map((index) => (
            <div className="flex items-center gap-3 px-4 py-3" key={index}>
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))
        : null}
      {!isPending && rowCount === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            {t("spaces.settings.nothingMounted")}
          </p>
        </div>
      ) : null}
      {groups.map((group) => {
        if (group.rows.length === 0) {
          return null;
        }
        const collapsed =
          Boolean(group.collapsible) && collapsedIds.has(group.id);
        return (
          <div
            className="border-border border-t first:border-t-0"
            key={group.id}
          >
            {group.collapsible ? (
              <button
                className="flex w-full items-center gap-1.5 px-4 py-2.5 text-muted-foreground text-xs transition-colors hover:bg-muted/30"
                onClick={() =>
                  setCollapsedIds((current) => {
                    const next = new Set(current);
                    if (next.has(group.id)) {
                      next.delete(group.id);
                    } else {
                      next.add(group.id);
                    }
                    return next;
                  })
                }
                type="button"
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-3 transition-transform",
                    collapsed ? "" : "rotate-90"
                  )}
                />
                {group.label}
              </button>
            ) : group.label ? (
              <div className="px-4 pt-3 pb-1">
                <p className="font-medium text-foreground text-xs">
                  {group.label}
                </p>
                {group.description ? (
                  <p className="text-muted-foreground text-xs">
                    {group.description}
                  </p>
                ) : null}
              </div>
            ) : null}
            {collapsed ? null : (
              <div className="divide-y divide-border">
                {group.rows.map((row) => (
                  <MountRowItem key={row.id} row={row} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {onConfigure ? (
        <button
          className="flex w-full items-center justify-center gap-2 border-border border-t px-4 py-3 font-semibold text-primary text-xs transition-colors hover:bg-primary/5"
          onClick={onConfigure}
          type="button"
        >
          <Settings2 className="size-3" />
          {action}
        </button>
      ) : null}
      {onConfigure && secondaryAction ? (
        <Link
          className="flex w-full items-center justify-center gap-2 border-border border-t px-4 py-3 font-semibold text-primary text-xs transition-colors hover:bg-primary/5"
          to={secondaryAction.to}
        >
          <Plus className="size-3" />
          {secondaryAction.label}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The person's OWN browser in this Space (PLAN-user-browser.md §2.6): one
 * logged-in Chromium per user per Space, driven by Engentys in that person's
 * name. Start / Open (live view with takeover) / Stop / Sign out, and the
 * unattended switch — the standing consent for agents to use it while the
 * person is away. Every action is keyed on the caller server-side; nobody
 * sees anyone else's row here.
 */
function SpaceBrowserRow({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [viewOpen, setViewOpen] = useState(false);
  const statusQuery = useQuery({
    queryFn: () => readUserBrowser(spaceId),
    queryKey: ["user-browser", spaceId],
    refetchInterval: viewOpen ? false : 30_000,
  });
  const grantQuery = useQuery({
    queryFn: ({ signal }) => getSpaceBrowserGrant(spaceId, signal),
    queryKey: ["space-browser-grant", spaceId],
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["user-browser", spaceId] });
  const start = useMutation({
    mutationFn: () => startUserBrowser(spaceId),
    onError: () => toast.error(t("spaces.settings.browserFailed")),
    onSuccess: refresh,
  });
  const stop = useMutation({
    mutationFn: () => stopUserBrowser(spaceId),
    onSuccess: refresh,
  });
  const signOut = useMutation({
    mutationFn: () => signOutUserBrowser(spaceId),
    onSuccess: () => {
      toast.success(t("spaces.settings.browserSignedOut"));
      return refresh();
    },
  });
  const grant = useMutation({
    mutationFn: (patch: { autostart?: boolean; unattended?: boolean }) =>
      putSpaceBrowserGrant(spaceId, patch),
    onError: () => toast.error(t("spaces.settings.saveFailed")),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["space-browser-grant", spaceId],
      }),
  });
  const state = statusQuery.data?.state ?? "absent";
  const busy =
    start.isPending || stop.isPending || signOut.isPending || grant.isPending;
  return (
    <>
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <SettingsOverviewIcon Icon={Globe as UiIconComponent} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium text-foreground text-sm">
              {t("spaces.settings.browserTitle")}
            </span>
            <span className="truncate text-muted-foreground text-xs">
              {t(`spaces.settings.browserState.${state}`)}
              {" · "}
              {t("spaces.settings.browserHint")}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {state === "running" ? (
              <>
                <Button
                  className="h-8 text-xs"
                  disabled={busy}
                  onClick={() => setViewOpen(true)}
                  size="sm"
                  variant="default"
                >
                  {t("spaces.settings.browserOpen")}
                </Button>
                <Button
                  className="h-8 text-xs"
                  disabled={busy}
                  onClick={() => stop.mutate()}
                  size="sm"
                  variant="outline"
                >
                  {t("spaces.settings.browserStop")}
                </Button>
              </>
            ) : (
              <Button
                className="h-8 text-xs"
                disabled={busy}
                onClick={() => start.mutate()}
                size="sm"
                variant="outline"
              >
                {t("spaces.settings.browserStart")}
              </Button>
            )}
            {state === "absent" ? null : (
              <Button
                className="h-8 text-xs"
                disabled={busy}
                onClick={() => signOut.mutate()}
                size="sm"
                variant="ghost"
              >
                {t("spaces.settings.browserSignOut")}
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 pl-9">
          <Switch
            aria-label={t("spaces.settings.browserAutostart")}
            checked={grantQuery.data?.autostart ?? false}
            disabled={grantQuery.isLoading || grant.isPending}
            onCheckedChange={(next) => grant.mutate({ autostart: next })}
          />
          <div className="flex min-w-0 flex-col">
            <span className="text-foreground text-sm">
              {t("spaces.settings.browserAutostart")}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("spaces.settings.browserAutostartHint")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 pl-9">
          <Switch
            aria-label={t("spaces.settings.browserUnattended")}
            checked={grantQuery.data?.unattended ?? false}
            disabled={grantQuery.isLoading || grant.isPending}
            onCheckedChange={(next) => grant.mutate({ unattended: next })}
          />
          <div className="flex min-w-0 flex-col">
            <span className="text-foreground text-sm">
              {t("spaces.settings.browserUnattended")}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("spaces.settings.browserUnattendedHint")}
            </span>
          </div>
        </div>
      </div>
      <Dialog onOpenChange={setViewOpen} open={viewOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t("spaces.settings.browserViewTitle")}</DialogTitle>
          </DialogHeader>
          {viewOpen ? <UserBrowserView spaceId={spaceId} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SpaceSettingsPage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const location = useLocation();
  const { spaceKey } = useParams<{ spaceKey: string }>();
  const { isSuperAdmin, isTenantAdmin } = useWorkspaceContext();
  const spacesQuery = useSpacesQuery();
  // Which mount kind is being edited — "open" and "which list" are one fact,
  // so they cannot disagree while the dialog animates out.
  const [editingKind, setEditingKind] = useState<SpaceResourceKind | null>(
    null
  );
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const space = useMemo(
    () =>
      (spacesQuery.data ?? []).find((item) => item.key === spaceKey) ?? null,
    [spaceKey, spacesQuery.data]
  );
  const spaceId = space?.id ?? null;

  const mountsQuery = useSpaceMountsQuery(spaceId);
  const catalogQuery = useSpaceSetupCatalogQuery();
  const agentsQuery = useSpaceAgentCatalogQuery();
  const skillsQuery = useSpaceSkillCatalogQuery();
  const connectorsQuery = useSpaceConnectorCatalogQuery();
  const { modules } = useSpaceModules(spaceId);
  const save = useSaveSpaceSetupMutation();

  const canManage = Boolean(isTenantAdmin || isSuperAdmin);
  // A personal space is a special TYPE of space: it belongs to one person and
  // has no members, ever (enforced by `core.forbid_personal_space_member`).
  const isPersonal = space?.ownerUserId != null;
  // Its own owner may configure it — admins deliberately cannot see private
  // spaces, so an admin-only rule would leave personal spaces unconfigurable.
  const canEdit = canManage || isPersonal;

  useEffect(() => {
    if (location.hash !== `#${SPACE_SETTINGS_PEOPLE_HASH}`) {
      return;
    }
    if (isPersonal || !spaceId) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(SPACE_SETTINGS_PEOPLE_HASH)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [isPersonal, location.hash, spaceId]);

  const mounts: readonly SpaceMount[] = useMemo(
    () => mountsQuery.data ?? [],
    [mountsQuery.data]
  );

  /**
   * Field-only edits, through the mount-reconciling endpoint.
   *
   * The setup endpoint takes the COMPLETE desired mount set, so a save that
   * only changes a colour has to post the current mounts back unchanged —
   * omitting them would unmount everything. Which also means: never save
   * before the mounts have loaded.
   */
  // What the two "inherit" options actually resolve to. A query the space
  // owner may not be allowed to run — the labels then stay bare, which is the
  // same sentence minus a parenthetical, never a broken row.
  const effectiveQuery = useEffectiveAiSettingsQuery();
  const inheritedApproval = effectiveQuery.data?.agent_approval.mode.value;
  const inheritedNetwork = effectiveQuery.data?.space_computer.network.value;
  const approvalModeLabel = (mode: AgentApprovalMode) =>
    t(
      mode === "pass-all"
        ? "spaces.settings.approval.passAll"
        : `spaces.settings.approval.${mode}`
    );

  const saveFields = (patch: {
    agentApprovalMode?: AgentApprovalMode | null;
    color?: string | null;
    computerNetworkTier?: ComputerNetworkTier | null;
    description?: string | null;
    icon?: string | null;
    name?: string;
    visibility?: "open" | "private";
  }) => {
    if (!space || mountsQuery.isPending) {
      return;
    }
    save.mutate(
      {
        color: patch.color === undefined ? space.color : patch.color,
        description:
          patch.description === undefined
            ? space.description
            : patch.description,
        icon: patch.icon === undefined ? space.icon : patch.icon,
        mounts: mounts.map((mount) => ({
          resource_key: mount.resourceKey,
          resource_type: mount.resourceType,
          ...(mount.agentAccess ? { agent_access: mount.agentAccess } : {}),
          ...(mount.recordScope ? { record_scope: mount.recordScope } : {}),
        })),
        name: patch.name ?? space.name,
        spaceId: space.id,
        // Omitted for a personal space rather than sent: it is always private
        // and the database refuses to open it.
        ...(isPersonal || patch.visibility === undefined
          ? {}
          : { visibility: patch.visibility }),
        ...(patch.agentApprovalMode === undefined
          ? {}
          : { agent_approval_mode: patch.agentApprovalMode }),
        ...(patch.computerNetworkTier === undefined
          ? {}
          : { computer_network_tier: patch.computerNetworkTier }),
      },
      {
        onError: () => {
          toast.error(
            t("spaces.settings.saveFailed", {
              defaultValue: "Could not save. Try again.",
            })
          );
        },
      }
    );
  };

  const appearance: SpaceAppearanceValue = {
    color: space?.color ?? null,
    icon: space?.icon ?? null,
  };

  const moduleMeta = useMemo(() => {
    const icons = new Map<string, UiIconComponent>();
    const labels = new Map<string, string>();
    const reachable = new Set<string>();
    for (const module of catalogQuery.data?.modules ?? []) {
      labels.set(module.id, module.name);
    }
    for (const app of modules) {
      labels.set(app.id, app.label);
      reachable.add(app.id);
      if (app.icon) {
        icons.set(app.id, app.icon);
      }
    }
    return { icons, labels, reachable };
  }, [modules, catalogQuery.data?.modules]);

  const agentMeta = useMemo(() => {
    const map = new Map<
      string,
      {
        canExecute: boolean;
        description?: string | null;
        engenty: AgentEngentyKind;
        managedByModule?: string | null;
        name: string;
        role?: string | null;
        source?: string | null;
      }
    >();
    for (const agent of agentsQuery.data ?? []) {
      map.set(agent.id, {
        // Only agents that declared a sandbox can run commands, and only they
        // get a compute choice — the rest never execute anything.
        canExecute: agent.can_execute === true,
        description: agent.description ?? null,
        // Same resolver the Work sidebar uses, so one engenty wears one face
        // wherever it appears.
        engenty: resolveAgentEngenty(agent.id, agent.engenty ?? undefined),
        managedByModule: agent.managed_by_module ?? null,
        name: agent.name,
        role: agent.role ?? null,
        source: agent.source ?? null,
      });
    }
    return map;
  }, [agentsQuery.data]);

  const skillMeta = useMemo(() => {
    const map = new Map<
      string,
      { description?: string | null; name: string }
    >();
    for (const skill of skillsQuery.data ?? []) {
      map.set(skill.name, {
        description: skill.description,
        name: skill.title ?? skill.name,
      });
    }
    return map;
  }, [skillsQuery.data]);

  // Accounts, not connectors (PLAN-spaces.md CN.3) — the same map the picker
  // labels its rows from, so what this card lists and what that dialog offers
  // cannot describe one mailbox two ways.
  const connectionMeta = useMemo(
    () => connectionMetaById(connectorsQuery.data ?? []),
    [connectorsQuery.data]
  );

  const moduleRows: MountRow[] = useMemo(
    () =>
      mounts
        .filter((mount) => mount.resourceType === "module")
        .map((mount) => ({
          access: mount.agentAccess,
          icon: moduleMeta.icons.get(mount.resourceKey) ?? Boxes,
          id: mount.resourceKey,
          label: moduleMeta.labels.get(mount.resourceKey) ?? mount.resourceKey,
          ...(moduleMeta.reachable.has(mount.resourceKey) && spaceKey
            ? { to: spaceModulePath(spaceKey, mount.resourceKey) }
            : {}),
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [moduleMeta, mounts, spaceKey]
  );

  // The roster answers "who works here", grouped by why each one is here — a
  // flat list makes a delegated sub-agent look like a peer of a hired Engenty,
  // and makes the platform rows the server refuses to unmount look removable.
  // Compute placement is NOT here: see the Compute card below.
  const agentSections: MountSection[] = useMemo(() => {
    const byKind = new Map<SpaceAgentKind, MountRow[]>();
    for (const mount of mounts) {
      if (mount.resourceType !== "agent") {
        continue;
      }
      const meta = agentMeta.get(mount.resourceKey);
      const kind = resolveSpaceAgentKind({
        id: mount.resourceKey,
        managedByModule: meta?.managedByModule ?? null,
        role: meta?.role ?? null,
        source: meta?.source ?? null,
      });
      const rows = byKind.get(kind) ?? [];
      rows.push({
        description: meta?.description ?? null,
        engenty: meta?.engenty ?? resolveAgentEngenty(mount.resourceKey),
        id: mount.resourceKey,
        label: meta?.name ?? mount.resourceKey,
      });
      byKind.set(kind, rows);
    }
    for (const rows of byKind.values()) {
      rows.sort((left, right) => left.label.localeCompare(right.label));
    }
    const delegated = byKind.get("delegated") ?? [];
    const platform = byKind.get("platform") ?? [];
    // The two groups nobody configures sit at the bottom, both collapsed:
    // platform engentys have no setting of their own and cannot be unmounted,
    // and delegated sub-agents are never addressed directly. What is left open
    // is what this card can actually change.
    return [
      {
        description: t("spaces.settings.agentsModuleHint"),
        id: "module",
        label: t("spaces.settings.agentsModule"),
        rows: byKind.get("module") ?? [],
      },
      {
        id: "hired",
        label: t("spaces.settings.agentsHired"),
        rows: byKind.get("hired") ?? [],
      },
      {
        collapsible: true,
        id: "platform",
        label: t("spaces.settings.agentsPlatform", { count: platform.length }),
        rows: platform,
      },
      {
        collapsible: true,
        id: "delegated",
        label: t("spaces.settings.agentsDelegated", {
          count: delegated.length,
        }),
        rows: delegated,
      },
    ];
  }, [agentMeta, mounts, t]);

  // For the Computer card's info line: how many of this space's Engentys can
  // execute code at all (their runs are what the switch places).
  const executingAgentCount = useMemo(
    () =>
      mounts.filter(
        (mount) =>
          mount.resourceType === "agent" &&
          agentMeta.get(mount.resourceKey)?.canExecute === true
      ).length,
    [agentMeta, mounts]
  );

  const skillRows: MountRow[] = useMemo(
    () =>
      mounts
        .filter((mount) => mount.resourceType === "skill")
        .map((mount) => ({
          description: skillMeta.get(mount.resourceKey)?.description ?? null,
          icon: Terminal as UiIconComponent,
          id: `skill:${mount.resourceKey}`,
          label: skillMeta.get(mount.resourceKey)?.name ?? mount.resourceKey,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [mounts, skillMeta]
  );

  const pluginRows: MountRow[] = useMemo(() => {
    const connectorNames = new Map(
      (connectorsQuery.data ?? []).map((connector) => [
        connector.id,
        connector.title ?? connector.name ?? connector.id,
      ])
    );
    const mountedConnectorIds = new Set<string>();
    const accountRows: MountRow[] = mounts
      .filter((mount) => mount.resourceType === "connection")
      .map((mount) => {
        const meta = connectionMeta.get(mount.resourceKey);
        if (meta?.connectorId) {
          mountedConnectorIds.add(meta.connectorId);
        }
        return {
          access: mount.agentAccess ?? null,
          description: meta?.connectorName ?? null,
          icon: Plug as UiIconComponent,
          id: `connection:${mount.resourceKey}`,
          label: meta?.label ?? mount.resourceKey,
        };
      });
    const pending = mounts
      .filter(
        (mount) =>
          mount.resourceType === "plugin" &&
          !mountedConnectorIds.has(mount.resourceKey)
      )
      .map((mount) => ({
        description: t("spaces.settings.needsAuth"),
        icon: Plug as UiIconComponent,
        id: `plugin:${mount.resourceKey}`,
        label: connectorNames.get(mount.resourceKey) ?? mount.resourceKey,
      }));
    return [...accountRows, ...pending].sort((left, right) =>
      left.label.localeCompare(right.label)
    );
  }, [connectionMeta, connectorsQuery.data, mounts, t]);

  // No `secondaryNavHeaderSlot` and no Setup crumb: this page is INSIDE the
  // space, so the column keeps the space's own switcher and Work/Data/Plan tabs.
  // The space crumb is a route fact (App.tsx), so only this page's leaf is added.
  usePageConfig({
    breadcrumbs: [{ label: t("navigation.settings") }],
  });

  if (!(spacesQuery.isPending || space)) {
    // The key is in the URL and no accessible space has it. Say so plainly —
    // the same answer a space you cannot enter gives, deliberately, so the page
    // never distinguishes "does not exist" from "not yours".
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto bg-muted/20">
        <div className="mx-auto w-full max-w-4xl p-page">
          <p className="text-muted-foreground text-sm">
            {t("spaces.notFound")}
          </p>
        </div>
      </div>
    );
  }

  // Null where the viewer may not edit, which is also how MountCard decides
  // whether to render a footer at all.
  const editKind = (kind: SpaceResourceKind) =>
    canEdit ? () => setEditingKind(kind) : null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto bg-muted/20">
      <div className="mx-auto w-full max-w-4xl space-y-8 p-page sm:pt-4">
        {/* Identity, centred — the same opening move as tenant settings, so the
            two pages read as one family. The tile is the rail tile at four times
            the size: what you are configuring, shown as it will be seen. */}
        <div className="flex flex-col items-center gap-4 pt-2 text-center sm:pt-4">
          {spacesQuery.isPending ? (
            <>
              <Skeleton className="size-20 rounded-2xl sm:size-24" />
              <Skeleton className="h-10 w-56" />
            </>
          ) : (
            <>
              {/* The tile is the rail tile at four times the size: what you are
                  configuring, shown as it will be seen — and the way in to
                  changing it, so the palette does not need a card of its own
                  above the settings people came for. */}
              <div className="group relative">
                <span
                  aria-hidden
                  className={cn(
                    "grid size-20 place-items-center overflow-hidden rounded-2xl font-semibold text-3xl shadow-sm sm:size-24 sm:text-4xl",
                    space?.color
                      ? "text-white"
                      : "bg-card text-foreground ring-1 ring-border"
                  )}
                  style={
                    space?.color ? { backgroundColor: space.color } : undefined
                  }
                >
                  <SpaceIconFace icon={space?.icon} name={space?.name ?? "?"} />
                </span>
                {canEdit ? (
                  <button
                    // Revealed on hover but always focusable: a control only a
                    // pointer can find is one keyboard users do not have.
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/40 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={() => setAppearanceOpen(true)}
                    type="button"
                  >
                    <Pencil className="mb-0.5 size-5 text-white" />
                    <span className="font-bold text-[10px] text-white uppercase tracking-[0.1em]">
                      {t("actions.edit")}
                    </span>
                  </button>
                ) : null}
              </div>
              <div className="flex flex-col items-center">
                <EditableText
                  as="h1"
                  className="px-4 py-1 font-bold text-3xl text-foreground tracking-[-0.03em] sm:text-4xl"
                  disabled={!canEdit}
                  onSave={(next: string) => {
                    const name = next.trim();
                    if (name && name !== space?.name) {
                      saveFields({ name });
                    }
                  }}
                  placeholder={t("spaces.setup.nameLabel")}
                  value={space?.name ?? ""}
                  variant="plain"
                />
                {/* One line about what this space is FOR — the same line its
                    home introduces it with. Empty is normal: a space that says
                    nothing here simply shows its name there. */}
                <EditableText
                  as="p"
                  className="mt-1 max-w-xl px-4 py-1 text-center text-[14px] text-muted-foreground"
                  disabled={!canEdit}
                  onSave={(next: string) => {
                    const description = next.trim();
                    if (description !== (space?.description ?? "")) {
                      saveFields({ description });
                    }
                  }}
                  placeholder={t("spaces.settings.descriptionPlaceholder", {
                    defaultValue: "What is this space for?",
                  })}
                  value={space?.description ?? ""}
                  variant="plain"
                />
                <p className="mt-1 font-medium text-[13px] text-muted-foreground/60 tracking-tight">
                  /s/{space?.key}
                  {isPersonal
                    ? ` · ${t("spaces.personalBadge")}`
                    : space?.visibility === "private"
                      ? ` · ${t("spaces.setup.privateLabel", { defaultValue: "Private space" })}`
                      : ""}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="space-y-8 pb-12">
          {/* Security — the three answers to "who gets in, how far can they
              go": who may open the space, how cautious it is about acting
              without a human, and how far off the machine its computer may
              reach. The space's name and appearance are edited in the header
              above, so this card is security and nothing else. */}
          {canEdit ? (
            <SettingsFormSection
              cardVariant="flush"
              description={t("spaces.settings.securityHint")}
              title={t("spaces.settings.securityTitle")}
            >
              {/* Label first, control last. A settings row reads left to right
                  — what this is, then what it is set to — and every other
                  control on this page (the access chips, the row chevrons)
                  already sits on the right edge. */}
              {isPersonal ? null : (
                <div className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <label
                      className="cursor-pointer font-medium text-foreground text-sm"
                      htmlFor="space-visibility"
                    >
                      {t("spaces.setup.privateLabel", {
                        defaultValue: "Private space",
                      })}
                    </label>
                    <p
                      className="text-muted-foreground text-xs"
                      id="space-visibility-hint"
                    >
                      {space?.visibility === "private"
                        ? t("spaces.setup.privateHint", {
                            defaultValue:
                              "Only members can open this space. Nothing is deleted — turning this off makes it visible to the whole team again.",
                          })
                        : t("spaces.setup.openHint", {
                            defaultValue:
                              "Everyone in the team can open this space.",
                          })}
                    </p>
                  </div>
                  <Switch
                    aria-describedby="space-visibility-hint"
                    checked={space?.visibility === "private"}
                    className="mt-0.5 shrink-0"
                    disabled={save.isPending || mountsQuery.isPending}
                    id="space-visibility"
                    onCheckedChange={(next: boolean) =>
                      saveFields({ visibility: next ? "private" : "open" })
                    }
                  />
                </div>
              )}
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <label
                    className="font-medium text-foreground text-sm"
                    htmlFor="space-approval-mode"
                  >
                    {t("spaces.settings.approvalTitle")}
                  </label>
                  <p
                    className="text-muted-foreground text-xs"
                    id="space-approval-mode-hint"
                  >
                    {t("spaces.settings.approvalHint")}
                  </p>
                </div>
                <select
                  aria-describedby="space-approval-mode-hint"
                  className="mt-0.5 h-8 shrink-0 rounded-md border bg-background px-2 text-sm"
                  disabled={save.isPending || mountsQuery.isPending}
                  id="space-approval-mode"
                  onChange={(e) => {
                    const next = e.target.value;
                    saveFields({
                      agentApprovalMode: next
                        ? parseAgentApprovalMode(next)
                        : null,
                    });
                  }}
                  value={space?.agentApprovalMode ?? ""}
                >
                  <option value="">
                    {inheritedApproval
                      ? t("spaces.settings.inheritResolved", {
                          label: t("spaces.settings.approvalInherit"),
                          value: approvalModeLabel(inheritedApproval),
                        })
                      : t("spaces.settings.approvalInherit")}
                  </option>
                  {AGENT_APPROVAL_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(
                        mode === "pass-all"
                          ? "spaces.settings.approval.passAll"
                          : `spaces.settings.approval.${mode}`
                      )}
                    </option>
                  ))}
                </select>
              </div>
              {/* Reach, not permission: `none` still runs code and still calls
                  Engenty operations — those travel over stdio — it only takes
                  away the open internet. The control sits here rather than in
                  the Computer card below because it is the one property of the
                  machine an admin decides on security grounds. */}
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <label
                    className="font-medium text-foreground text-sm"
                    htmlFor="space-computer-network"
                  >
                    {t("spaces.settings.networkTitle")}
                  </label>
                  <p
                    className="text-muted-foreground text-xs"
                    id="space-computer-network-hint"
                  >
                    {t("spaces.settings.networkHint")}{" "}
                    {t("spaces.settings.networkHintReset")}
                  </p>
                </div>
                <select
                  aria-describedby="space-computer-network-hint"
                  className="mt-0.5 h-8 shrink-0 rounded-md border bg-background px-2 text-sm"
                  disabled={save.isPending || mountsQuery.isPending}
                  id="space-computer-network"
                  onChange={(e) => {
                    const next = e.target.value;
                    saveFields({
                      computerNetworkTier: next
                        ? parseComputerNetworkTier(next)
                        : null,
                    });
                  }}
                  value={space?.computerNetworkTier ?? ""}
                >
                  <option value="">
                    {inheritedNetwork
                      ? t("spaces.settings.inheritResolved", {
                          label: t("spaces.settings.networkInherit"),
                          value: t(
                            `spaces.settings.network.${inheritedNetwork}`
                          ),
                        })
                      : t("spaces.settings.networkInherit")}
                  </option>
                  {COMPUTER_NETWORK_TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {t(`spaces.settings.network.${tier}`)}
                    </option>
                  ))}
                </select>
              </div>
            </SettingsFormSection>
          ) : null}

          {/* Personal spaces have no roster at all — `owner_user_id` IS their
              access grant, and the database refuses a member row on one. A
              section that could only ever say "nobody here" is worse than
              none. */}
          {isPersonal || !spaceId ? null : (
            <div className="scroll-mt-6" id={SPACE_SETTINGS_PEOPLE_HASH}>
              <SettingsFormSection
                cardVariant="flush"
                /* On an OPEN space this list gates nothing: `canAccessSpace`
                   returns true for the whole tenant before it ever looks for a
                   member row. Saying "who can open this space" over a roster
                   that admits nobody and excludes nobody is the one sentence
                   here that can be flatly untrue, so it follows the switch. */
                description={
                  space?.visibility === "private"
                    ? t("spaces.members.description")
                    : t("spaces.members.descriptionOpen")
                }
                title={t("spaces.members.section")}
              >
                <SpaceMembersCard canManage={canManage} spaceId={spaceId} />
              </SettingsFormSection>
            </div>
          )}

          {/* One card per mount kind, each with its own editor. Skills and
              connections had shared a card; splitting them means every card's
              footer opens exactly the list that card shows, with no "which half
              am I editing" left over. */}
          <SettingsFormSection
            cardVariant="flush"
            description={t("spaces.setup.appsHint")}
            title={t("spaces.setup.appsTitle")}
          >
            <MountCard
              action={t("spaces.settings.chooseApps")}
              isPending={mountsQuery.isPending}
              onConfigure={editKind("module")}
              rows={moduleRows}
            />
          </SettingsFormSection>

          <SettingsFormSection
            cardVariant="flush"
            description={t("spaces.setup.agentsHint")}
            title={t("spaces.setup.agentsTitle")}
          >
            <MountCard
              action={t("spaces.settings.chooseAgents")}
              isPending={mountsQuery.isPending}
              onConfigure={editKind("agent")}
              sections={agentSections}
            />
          </SettingsFormSection>

          {/* The Computer card: every Engenty that executes code does so on
              this space's shared computer. Live state (running containers,
              Stop, Reset) stays in the admin Computers view. */}
          {canEdit && spaceId ? (
            <SettingsFormSection
              cardVariant="flush"
              description={t("spaces.settings.computeHint")}
              title={t("spaces.settings.computeTitle")}
            >
              <div className="divide-y divide-border">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium text-foreground text-sm">
                      {t("spaces.settings.computeSharedLabel")}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {t("spaces.settings.computeSharedHint")}
                      {executingAgentCount > 0
                        ? ` ${t("spaces.settings.computeAgentsCount", {
                            count: executingAgentCount,
                          })}`
                        : ""}
                    </span>
                  </div>
                </div>
                <SpaceBrowserRow spaceId={spaceId} />
              </div>
            </SettingsFormSection>
          ) : null}

          <SettingsFormSection
            cardVariant="flush"
            description={t("spaces.setup.skillsHint")}
            title={t("spaces.setup.skillsTitle")}
          >
            <MountCard
              action={t("spaces.settings.chooseSkills")}
              isPending={mountsQuery.isPending}
              onConfigure={editKind("skill")}
              rows={skillRows}
            />
          </SettingsFormSection>

          <SettingsFormSection
            cardVariant="flush"
            description={t("spaces.setup.pluginsHint")}
            title={t("spaces.setup.pluginsTitle")}
          >
            <MountCard
              action={t("spaces.settings.choosePlugins")}
              isPending={mountsQuery.isPending}
              onConfigure={editKind("plugin")}
              rows={pluginRows}
            />
          </SettingsFormSection>

          {canManage && space && !isPersonal ? (
            <SpaceDangerZone
              onDeleted={() => {
                navigate("/settings/spaces", { replace: true });
              }}
              space={space}
            />
          ) : null}
        </div>
      </div>

      {canEdit ? (
        <>
          <SpaceAppearanceDialog
            name={space?.name ?? ""}
            onOpenChange={setAppearanceOpen}
            onSave={(next) => {
              saveFields({ color: next.color, icon: next.icon });
              setAppearanceOpen(false);
            }}
            open={appearanceOpen}
            saving={save.isPending}
            value={appearance}
          />
          <SpaceMountsDialog
            kind={editingKind}
            onOpenChange={(next) => {
              if (!next) {
                setEditingKind(null);
              }
            }}
            open={editingKind != null}
            space={space}
          />
        </>
      ) : null}
    </div>
  );
}
