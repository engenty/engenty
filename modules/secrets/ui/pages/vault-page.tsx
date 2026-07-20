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
  Input,
  Skeleton,
} from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import {
  Building2,
  FolderOpen,
  Plus,
  Search,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { type ComponentType, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SecretListItem } from "../api.js";
import { SecretFormDialog } from "../components/secret-form-dialog.js";
import { SecretRow } from "../components/secret-row.js";
import { useSecretsModuleSecondaryShellNav } from "../hooks/use-secrets-module-secondary-shell-nav.js";
import {
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
  const [clientFilter] = useQueryState("client", parseAsString);
  const [projectFilter] = useQueryState("project", parseAsString);
  const scopeFilter = parseSecretsScopeFilter(scopeRaw);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SecretListItem | null>(null);

  const clients = clientsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  const filtersActive =
    q.trim() !== "" ||
    scopeFilter !== null ||
    Boolean(clientFilter) ||
    Boolean(projectFilter);

  function clearFilters() {
    navigate(
      secretsVaultHref({ q: "", scope: null, client: null, project: null })
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
    clientFilter,
    projectFilter,
    currentTenant?.name,
    currentUserId,
    t,
  ]);

  const isLoading = secretsQuery.isLoading;
  const isEmpty = !isLoading && (secretsQuery.data?.length ?? 0) === 0;
  const isFilteredEmpty = !(isLoading || isEmpty) && groups.length === 0;

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(secret: SecretListItem) {
    setEditing(secret);
    setFormOpen(true);
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
    [navigate, t]
  );

  usePageConfig({
    actions: pageActions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const activeFilterLabel = useMemo(() => {
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
    if (scopeFilter === "user") {
      return t("sidebar.personal");
    }
    if (scopeFilter === "tenant") {
      return t("sidebar.workspace");
    }
    return null;
  }, [projectFilter, clientFilter, scopeFilter, projects, clients, t]);

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
      <div className="mx-auto w-full max-w-4xl space-y-4 pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => {
                const value = event.target.value;
                void setQ(value === "" ? null : value);
              }}
              placeholder={t("vault.searchPlaceholder")}
              value={q}
            />
          </div>
          {filtersActive ? (
            <Button
              className="shrink-0 text-muted-foreground"
              onClick={clearFilters}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X className="mr-1 h-4 w-4" />
              {activeFilterLabel
                ? t("filter.clearNamed", {
                    name: activeFilterLabel,
                    defaultValue: `Clear · ${activeFilterLabel}`,
                  })
                : t("filter.clear")}
            </Button>
          ) : null}
        </div>

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
              <EmptyDescription>{t("vault.emptyDescription")}</EmptyDescription>
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
    </section>
  );
}
