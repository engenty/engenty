import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import {
  Building2,
  Eye,
  EyeOff,
  FolderOpen,
  Plus,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { type ComponentType, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SecretListItem } from "../api.js";
import { SecretFormDialog } from "../components/secret-form-dialog.js";
import {
  SecretRow,
  type SecretsBulkRevealCommand,
} from "../components/secret-row.js";
import {
  SecretsListFilterBar,
  type SecretsListFilterState,
} from "../components/secrets-list-filter-bar.js";
import { SecretsListToolbar } from "../components/secrets-list-toolbar.js";
import { useSecretsModuleSecondaryShellNav } from "../hooks/use-secrets-module-secondary-shell-nav.js";
import {
  parseSecretsKindFilter,
  parseSecretsScopeFilter,
  secretsVaultHref,
} from "../lib/secrets-vault-url.js";
import {
  useClientsQuery,
  useProjectsQuery,
  useSecretsQuery,
} from "../queries.js";
import { SECRETS_IMPORT_PATH } from "../secrets-paths.js";

/**
 * Secrets Vault — the engrdian dashboard analogue on engenty rails: secrets
 * grouped by owner (client / project / workspace / personal), searchable, with
 * per-row audited reveal. Plaintext only ever lives in transient row state.
 */

interface SecretGroup {
  icon: ComponentType<{ className?: string }>;
  key: string;
  order: number;
  rows: SecretListItem[];
  subtitle: string;
  title: string;
}

export function VaultPage() {
  const { t } = useTranslation("secrets");
  const navigate = useNavigate();
  const { currentTenant, currentUserId } = useWorkspaceContext();
  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useSecretsModuleSecondaryShellNav();

  const secretsQuery = useSecretsQuery();
  const clientsQuery = useClientsQuery();
  const projectsQuery = useProjectsQuery();

  const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
  const [scopeRaw] = useQueryState("scope", parseAsString);
  const [kindRaw] = useQueryState("kind", parseAsString);
  const [clientFilter] = useQueryState("client", parseAsString);
  const [projectFilter] = useQueryState("project", parseAsString);
  const scopeFilter = parseSecretsScopeFilter(scopeRaw);
  const kindFilter = parseSecretsKindFilter(kindRaw);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SecretListItem | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [revealAllActive, setRevealAllActive] = useState(false);
  const [bulkReveal, setBulkReveal] = useState<SecretsBulkRevealCommand>({
    mode: "hide",
    seq: 0,
  });

  const clients = clientsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  const currentFilters = useMemo(
    () => ({
      q,
      scope: scopeFilter,
      kind: kindFilter,
      client: clientFilter,
      project: projectFilter,
    }),
    [q, scopeFilter, kindFilter, clientFilter, projectFilter]
  );

  const chipFilters: SecretsListFilterState = {
    scope: scopeFilter ?? "all",
    kind: kindFilter ?? "all",
  };

  const hasActiveChipFilters =
    scopeFilter !== null ||
    kindFilter !== null ||
    Boolean(clientFilter) ||
    Boolean(projectFilter);

  function clearFilters() {
    navigate(
      secretsVaultHref({
        q: "",
        scope: null,
        kind: null,
        client: null,
        project: null,
      })
    );
  }

  function clearOwnerFilter() {
    navigate(secretsVaultHref({ client: null, project: null }, currentFilters));
  }

  function handleChipFiltersChange(next: SecretsListFilterState) {
    navigate(
      secretsVaultHref(
        {
          scope: next.scope === "all" ? null : next.scope,
          kind: next.kind === "all" ? null : next.kind,
          // Scope chip is mutually exclusive with owner (client/project) picks.
          ...(next.scope === chipFilters.scope
            ? {}
            : { client: null, project: null }),
        },
        currentFilters
      )
    );
  }

  const groups = useMemo<SecretGroup[]>(() => {
    const clientNames = new Map(clients.map((c) => [c.id, c.display_name]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const needle = q.trim().toLowerCase();

    const groupMeta = (
      secret: SecretListItem
    ): Omit<SecretGroup, "key" | "rows"> => {
      switch (secret.owner_scope) {
        case "client":
          return {
            title: clientNames.get(secret.owner_id) ?? t("group.unknownClient"),
            subtitle: t("scope.client"),
            icon: Building2,
            order: 0,
          };
        case "project": {
          const project = projectById.get(secret.owner_id);
          const clientName = project?.client_id
            ? clientNames.get(project.client_id)
            : undefined;
          return {
            title: project?.title ?? t("group.unknownProject"),
            subtitle: clientName ?? t("scope.project"),
            icon: FolderOpen,
            order: 1,
          };
        }
        case "tenant":
          return {
            title: currentTenant?.name ?? t("group.workspace"),
            subtitle: t("scope.tenant"),
            icon: Users,
            order: 2,
          };
        default:
          return secret.owner_id === currentUserId
            ? {
                title: t("group.personal"),
                subtitle: t("scope.user"),
                icon: UserRound,
                order: 3,
              }
            : {
                title: t("group.otherUser"),
                subtitle: t("scope.user"),
                icon: UserRound,
                order: 4,
              };
      }
    };

    const matches = (secret: SecretListItem, title: string): boolean => {
      if (scopeFilter && secret.owner_scope !== scopeFilter) {
        return false;
      }
      if (kindFilter && secret.kind !== kindFilter) {
        return false;
      }
      if (clientFilter) {
        const ownedByClient =
          secret.owner_scope === "client" && secret.owner_id === clientFilter;
        const projectOfClient =
          secret.owner_scope === "project" &&
          projectById.get(secret.owner_id)?.client_id === clientFilter;
        if (!(ownedByClient || projectOfClient)) {
          return false;
        }
      }
      if (
        projectFilter &&
        !(secret.owner_scope === "project" && secret.owner_id === projectFilter)
      ) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return [secret.name, secret.url, secret.description, secret.kind, title]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    };

    const byKey = new Map<string, SecretGroup>();
    for (const secret of secretsQuery.data ?? []) {
      const meta = groupMeta(secret);
      if (!matches(secret, meta.title)) {
        continue;
      }
      const key =
        secret.owner_scope === "user" && secret.owner_id !== currentUserId
          ? "user:other"
          : `${secret.owner_scope}:${secret.owner_id}`;
      const group = byKey.get(key) ?? { key, rows: [], ...meta };
      group.rows.push(secret);
      byKey.set(key, group);
    }
    for (const group of byKey.values()) {
      group.rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }
    return [...byKey.values()].sort(
      (a, b) => a.order - b.order || a.title.localeCompare(b.title)
    );
  }, [
    secretsQuery.data,
    clients,
    projects,
    q,
    scopeFilter,
    kindFilter,
    clientFilter,
    projectFilter,
    currentTenant?.name,
    currentUserId,
    t,
  ]);

  const isLoading = secretsQuery.isLoading;
  const isEmpty = !isLoading && (secretsQuery.data?.length ?? 0) === 0;
  const isFilteredEmpty = !(isLoading || isEmpty) && groups.length === 0;
  const visibleCount = groups.reduce(
    (sum, group) => sum + group.rows.length,
    0
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(secret: SecretListItem) {
    setEditing(secret);
    setFormOpen(true);
  }

  function toggleRevealAll() {
    if (revealAllActive) {
      setBulkReveal({ mode: "hide", seq: Date.now() });
      setRevealAllActive(false);
      return;
    }
    setBulkReveal({ mode: "show", seq: Date.now() });
    setRevealAllActive(true);
  }

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("vault.overview") },
    ],
    [moduleRootCrumb, t]
  );

  const pageActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={
                  revealAllActive ? t("vault.hideAll") : t("vault.revealAll")
                }
                disabled={visibleCount === 0}
                onClick={toggleRevealAll}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                {revealAllActive ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {revealAllActive ? t("vault.hideAll") : t("vault.revealAll")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("vault.addSecret")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t("vault.addSecret")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(SECRETS_IMPORT_PATH)}>
              <Upload className="mr-2 h-4 w-4" />
              {t("import.label")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
    [navigate, revealAllActive, t, visibleCount]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const activeOwnerLabel = useMemo(() => {
    if (projectFilter) {
      return (
        projects.find((project) => project.id === projectFilter)?.title ??
        t("group.unknownProject")
      );
    }
    if (clientFilter) {
      return (
        clients.find((client) => client.id === clientFilter)?.display_name ??
        t("group.unknownClient")
      );
    }
    return null;
  }, [projectFilter, clientFilter, projects, clients, t]);

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden p-page">
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-5 pt-4">
        <div className="shrink-0 space-y-2">
          <SecretsListToolbar
            filtersExpanded={filtersExpanded}
            hasActiveFilters={hasActiveChipFilters}
            onFiltersToggle={() => setFiltersExpanded((prev) => !prev)}
            onSearchChange={(value) => {
              void setQ(value === "" ? null : value);
            }}
            searchPlaceholder={t("vault.searchPlaceholder")}
            searchQuery={q}
            summary={t("vault.secretCount", { count: visibleCount })}
            toggleFiltersLabel={t("filter.toggle")}
          />
          <SecretsListFilterBar
            activeOwnerLabel={activeOwnerLabel}
            filtersExpanded={filtersExpanded}
            hasActiveChipFilters={hasActiveChipFilters}
            onChange={handleChipFiltersChange}
            onClearAll={clearFilters}
            onClearOwner={clearOwnerFilter}
            value={chipFilters}
          />
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-10">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {isEmpty && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t("vault.emptyTitle")}</EmptyTitle>
                <EmptyDescription>
                  {t("vault.emptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {isFilteredEmpty && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t("vault.noMatchesTitle")}</EmptyTitle>
                <EmptyDescription>
                  {t("vault.noMatchesDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {groups.map((group) => {
            const GroupIcon = group.icon;
            return (
              <Card className="overflow-hidden p-0 sm:p-0" key={group.key}>
                <div className="flex items-center gap-3 border-border border-b bg-muted/40 px-4 py-3">
                  <GroupIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-muted-foreground text-xs">
                      {group.subtitle}
                    </div>
                    <h3 className="truncate font-semibold text-base">
                      {group.title}
                    </h3>
                  </div>
                  <span className="whitespace-nowrap text-muted-foreground text-xs">
                    {t("vault.secretCount", { count: group.rows.length })}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {group.rows.map((secret) => (
                    <SecretRow
                      bulkReveal={bulkReveal}
                      key={secret.id}
                      onEdit={openEdit}
                      secret={secret}
                    />
                  ))}
                </div>
              </Card>
            );
          })}

          <SecretFormDialog
            clients={clients}
            currentUserId={currentUserId}
            onOpenChange={(open) => {
              setFormOpen(open);
              if (!open) {
                setEditing(null);
              }
            }}
            open={formOpen}
            projects={projects}
            secret={editing}
            tenantId={currentTenant?.id ?? null}
          />
        </div>
      </div>
    </section>
  );
}
