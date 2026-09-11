// Superadmin console for importing external connectors (OpenAPI specs, MCP
// servers, integrations.sh registry) at /setup/connectors.
// Imports are platform-level; imported connectors then show up in the normal
// per-tenant connections console with zero extra UI on that side.

import { useSetupSecondaryShellNav } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useMutation } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  Checkbox,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { RefreshCw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  ActionClassification,
  DiscoverDomainResult,
  DiscoveredSource,
  ExternalSourceKind,
  ImportConnectorResult,
  ImportedConnector,
  RegistrySearchResult,
  RegistrySearchSurface,
  SourcePreview,
} from "../api.js";
import {
  apiErrorMessage,
  discoverDomain,
  previewSource,
  searchRegistry,
} from "../api.js";
import {
  useDeleteConnectorMutation,
  useImportConnectorMutation,
  useImportedConnectorsQuery,
  useRefreshConnectorMutation,
  useSetConnectorStatusMutation,
  useWorkspaceSuperadminQuery,
} from "../queries.js";

/** Install-owner setup area (platform-wide ops; not tenant Settings). */
export const SETUP_ROOT_PATH = "/setup";
export const EXTERNAL_IMPORT_PATH = `${SETUP_ROOT_PATH}/connectors`;
/** Former Agents-workspace URL — keep a redirect for bookmarks. */
export const EXTERNAL_IMPORT_LEGACY_PATH = "/admin/engenty/connections/import";

/**
 * Kebab connector id from a registry surface slug or a domain:
 * "stripe-mcp-server" → "stripe-mcp-server", "api.sentry.io" → "api-sentry-io".
 * Mirrors `connectorIdFromSlug` server-side; the server has the final say.
 */
function kebabIdFrom(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^[-0-9]+|-+$/gu, "")
    .slice(0, 60);
}

/** Snake tool prefix from a slug or domain: "api.sentry.io" → "api_sentry_io". */
function snakePrefixFrom(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^[_0-9]+|_+$/gu, "")
    .slice(0, 30);
}

/** Whether the previewed spec's security schemes call for an OAuth client. */
function suggestsOauthClient(schemes: Record<string, unknown> | null): boolean {
  if (!schemes) {
    return false;
  }
  return Object.values(schemes).some((scheme) => {
    if (typeof scheme !== "object" || scheme === null) {
      return false;
    }
    const type = (scheme as { type?: unknown }).type;
    return type === "oauth2" || type === "openIdConnect";
  });
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function ClassificationBadge({
  classification,
}: {
  classification: ActionClassification;
}) {
  // ui-core Badge has no destructive variant; tint the outline one instead.
  if (classification === "destructive") {
    return (
      <Badge
        className="border-destructive/50 text-destructive"
        variant="outline"
      >
        {classification}
      </Badge>
    );
  }
  return (
    <Badge variant={classification === "write" ? "outline" : "secondary"}>
      {classification}
    </Badge>
  );
}

function KindBadge({ kind }: { kind: string }) {
  return <Badge variant="outline">{kind}</Badge>;
}

export function ExternalImportPage() {
  const { t } = useTranslation("common");
  const { moduleRootCrumb, secondaryNavHeaderSlot } = useSetupSecondaryShellNav(
    t("navigation.setup")
  );

  const breadcrumbs = useMemo(
    () => [
      ...(moduleRootCrumb ? [moduleRootCrumb] : []),
      { label: t("navigation.setupConnectors") },
    ],
    [moduleRootCrumb, t]
  );

  usePageConfig({
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavHeaderSlot,
  });

  const workspace = useWorkspaceSuperadminQuery();
  const isSuperAdmin = workspace.data?.isSuperAdmin === true;

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-page pb-10">
      <div className="mx-auto w-full max-w-5xl space-y-8 pt-4">
        {workspace.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : isSuperAdmin ? (
          <>
            <ImportedConnectorsSection />
            <ImportWizardSection />
          </>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Requires superadmin</EmptyTitle>
              <EmptyDescription>
                Importing external connectors is a platform-level operation and
                is only available to superadmins.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </section>
  );
}

function ImportedConnectorsSection() {
  const listQuery = useImportedConnectorsQuery();
  const connectors = listQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-semibold text-lg">Imported connectors</h2>
        <p className="text-muted-foreground text-sm">
          Connectors imported from OpenAPI specs, MCP servers, or the
          integrations registry. Imports apply platform-wide.
        </p>
      </div>
      {listQuery.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : listQuery.isError ? (
        <p className="text-destructive text-sm">
          Failed to load imported connectors: {apiErrorMessage(listQuery.error)}
        </p>
      ) : connectors.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing imported yet</EmptyTitle>
            <EmptyDescription>
              Use the import wizard below to bring in the first external
              connector.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="space-y-0 overflow-x-auto" variant="settings">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Connector</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead>OAuth client</TableHead>
                <TableHead>Refreshed</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connectors.map((connector) => (
                <ImportedConnectorRow
                  connector={connector}
                  key={connector.id}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function ImportedConnectorRow({ connector }: { connector: ImportedConnector }) {
  const refresh = useRefreshConnectorMutation();
  const setStatus = useSetConnectorStatusMutation();
  const remove = useDeleteConnectorMutation();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleRefresh = () => {
    refresh.mutate(connector.id, {
      onError: (error) => {
        toast.error(`Refresh failed: ${apiErrorMessage(error)}`);
      },
      onSuccess: (result) => {
        const summary = `${result.added.length} added, ${result.removed.length} removed`;
        if (result.restart_recommended) {
          toast.warning(`Refreshed ${connector.id}: ${summary}`, {
            description:
              "Removed actions fully settle on the next core restart.",
          });
        } else {
          toast.success(`Refreshed ${connector.id}: ${summary}`);
        }
        if (result.skipped_actions.length > 0) {
          toast.warning(
            `${result.skipped_actions.length} action(s) skipped at registration: ${result.skipped_actions.join(", ")}`
          );
        }
      },
    });
  };

  const handleStatusChange = (enabled: boolean) => {
    const status = enabled ? ("enabled" as const) : ("disabled" as const);
    setStatus.mutate(
      { id: connector.id, status },
      {
        onError: (error) => {
          toast.error(`Status change failed: ${apiErrorMessage(error)}`);
        },
        onSuccess: () => {
          toast.success(`${connector.id} ${status}`);
        },
      }
    );
  };

  const handleDelete = () => {
    remove.mutate(connector.id, {
      onError: (error) => {
        toast.error(`Delete failed: ${apiErrorMessage(error)}`);
      },
      onSuccess: () => {
        toast.success(`Deleted ${connector.id}`, {
          description: "A core restart is recommended to drop its operations.",
        });
      },
    });
  };

  return (
    <TableRow>
      <TableCell>
        <div className="min-w-0">
          <div className="font-medium">{connector.name}</div>
          <div className="text-muted-foreground text-xs">
            {connector.id} · {connector.tool_prefix}_*
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-[180px] truncate">
        {connector.domain}
      </TableCell>
      <TableCell>
        <KindBadge kind={connector.source_kind} />
      </TableCell>
      <TableCell>{connector.action_count}</TableCell>
      <TableCell>
        {connector.has_oauth_client ? (
          <Badge variant="secondary">configured</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {formatTimestamp(connector.refreshed_at ?? connector.imported_at)}
      </TableCell>
      <TableCell>
        <Switch
          aria-label={`Enable ${connector.id}`}
          checked={connector.status === "enabled"}
          disabled={setStatus.isPending}
          onCheckedChange={handleStatusChange}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            aria-label={`Refresh ${connector.id}`}
            disabled={refresh.isPending}
            onClick={handleRefresh}
            size="sm"
            type="button"
            variant="ghost"
          >
            {refresh.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
          <Button
            aria-label={`Delete ${connector.id}`}
            disabled={remove.isPending}
            onClick={() => setConfirmDelete(true)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{connector.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                Removes the imported connector and its {connector.action_count}{" "}
                action(s) platform-wide. Existing connections to it stop
                working. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

interface WizardSource {
  domain: string;
  source_kind: ExternalSourceKind;
  source_url: string;
}

interface WizardConfig {
  base_url: string;
  id: string;
  name: string;
  oauth_client_id: string;
  oauth_client_secret: string;
  tool_prefix: string;
  useOauthClient: boolean;
}

const EMPTY_CONFIG: WizardConfig = {
  base_url: "",
  id: "",
  name: "",
  oauth_client_id: "",
  oauth_client_secret: "",
  tool_prefix: "",
  useOauthClient: false,
};

function ImportWizardSection() {
  const [source, setSource] = useState<WizardSource>({
    domain: "",
    source_kind: "openapi",
    source_url: "",
  });
  const [config, setConfig] = useState<WizardConfig>(EMPTY_CONFIG);
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [selectedActions, setSelectedActions] = useState<Set<string>>(
    new Set()
  );
  const [importResult, setImportResult] =
    useState<ImportConnectorResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // Registry-resolved importable sources for the picked domain; only rendered
  // while `source.domain` still matches, so manual edits hide a stale list.
  const [discovered, setDiscovered] = useState<DiscoverDomainResult | null>(
    null
  );
  // Persistent inline error for discover/preview failures — toasts alone are
  // too easy to miss, and a failed step must explain what to do next.
  const [wizardError, setWizardError] = useState<string | null>(null);

  const discoverMutation = useMutation({
    mutationFn: (domain: string) => discoverDomain(domain),
  });
  const previewMutation = useMutation({
    mutationFn: (input: WizardSource) =>
      previewSource({
        domain: input.domain || null,
        source_kind: input.source_kind,
        source_url: input.source_url,
      }),
  });
  const importMutation = useImportConnectorMutation();

  const resetPreview = () => {
    setPreview(null);
    setSelectedActions(new Set());
    setImportResult(null);
    setImportError(null);
    previewMutation.reset();
  };

  const applySource = (next: WizardSource) => {
    // Manual-tab convenience: derive the domain from the source URL so the
    // import isn't blocked on a field most admins would fill identically.
    let domain = next.domain;
    if (!domain.trim() && next.source_url.trim()) {
      try {
        domain = new URL(next.source_url).hostname;
      } catch {
        // not a URL yet — keep typing
      }
    }
    setSource({ ...next, domain });
    resetPreview();
    setWizardError(null);
    setConfig((current) => ({
      ...current,
      id: current.id || kebabIdFrom(next.domain),
      tool_prefix: current.tool_prefix || snakePrefixFrom(next.domain),
    }));
  };

  const handlePickResult = (
    result: RegistrySearchResult,
    picked?: RegistrySearchSurface
  ) => {
    const kind: ExternalSourceKind = picked
      ? (picked.kind as ExternalSourceKind)
      : result.kinds.includes("mcp")
        ? result.kinds.includes("openapi")
          ? "openapi"
          : "mcp"
        : "openapi";
    // Id and tool prefix come from the surface slug once discover resolves
    // one — a domain has several surfaces and they must not collide.
    setConfig({
      ...EMPTY_CONFIG,
      id: picked ? kebabIdFrom(picked.slug) : "",
      name: result.name,
      tool_prefix: picked ? snakePrefixFrom(picked.slug) : "",
    });
    // The search result's own `url` is the registry's catalog page — never a
    // usable spec/MCP endpoint. A picked surface does carry one; otherwise
    // leave the source empty until discover resolves one.
    setSource({
      domain: result.domain,
      source_kind: kind,
      source_url: picked?.url ?? "",
    });
    resetPreview();
    setDiscovered(null);
    setWizardError(null);
    discoverMutation.mutate(result.domain, {
      onError: (error) => {
        // Non-fatal, but must be visible: keep it inline until the next step.
        setWizardError(
          `Could not resolve importable sources for ${result.domain}: ${apiErrorMessage(error)}. The registry may be temporarily unavailable — retry, or paste a spec/MCP URL on the Manual URL tab.`
        );
      },
      onSuccess: (resolved) => {
        setDiscovered(resolved);
        if (picked) {
          // An explicitly picked surface is not replaced by discover's first.
          return;
        }
        const [first] = resolved.sources.filter(
          (entry) => entry.blocked_reason === null
        );
        if (first) {
          setConfig((current) => ({
            ...current,
            id: current.id || first.surface.suggested_id,
            name: current.name || first.surface.name || result.name,
            tool_prefix:
              current.tool_prefix || first.surface.suggested_tool_prefix,
          }));
          // Auto-apply the first resolved source, but only while the source
          // is still empty — never clobber an admin edit.
          setSource((current) =>
            current.domain === result.domain && current.source_url === ""
              ? {
                  domain: result.domain,
                  source_kind: first.source_kind,
                  source_url: first.source_url,
                }
              : current
          );
        }
      },
    });
  };

  const handlePickDiscoveredSource = (entry: DiscoveredSource) => {
    setSource((current) => ({
      ...current,
      source_kind: entry.source_kind,
      source_url: entry.source_url,
    }));
    setConfig((current) => ({
      ...current,
      id: entry.surface.suggested_id,
      name: current.name || entry.surface.name || current.name,
      tool_prefix: entry.surface.suggested_tool_prefix,
    }));
    resetPreview();
    setWizardError(null);
  };

  const handlePreview = () => {
    setImportResult(null);
    setImportError(null);
    setWizardError(null);
    previewMutation.mutate(source, {
      onError: (error) => {
        setPreview(null);
        setWizardError(`Preview failed: ${apiErrorMessage(error)}`);
      },
      onSuccess: (result) => {
        setPreview(result);
        setSelectedActions(new Set(result.actions.map((action) => action.id)));
        setConfig((current) => ({
          ...current,
          base_url: current.base_url || (result.base_url ?? ""),
          // The resolved surface slug is the identity; the domain is only a
          // fallback for a manual URL the registry does not list.
          id:
            current.id ||
            result.surface?.suggested_id ||
            kebabIdFrom(source.domain),
          name:
            current.name ||
            result.title ||
            result.surface?.name ||
            source.domain,
          tool_prefix:
            current.tool_prefix ||
            result.surface?.suggested_tool_prefix ||
            snakePrefixFrom(source.domain),
          useOauthClient:
            current.useOauthClient ||
            suggestsOauthClient(result.security_schemes),
        }));
      },
    });
  };

  const handleImport = () => {
    if (!preview) {
      return;
    }
    setImportResult(null);
    setImportError(null);
    const allSelected = selectedActions.size === preview.actions.length;
    importMutation.mutate(
      {
        action_filter: allSelected ? null : [...selectedActions],
        base_url: config.base_url.trim() || null,
        domain: source.domain.trim(),
        id: config.id.trim(),
        name: config.name.trim() || null,
        oauth_client_id:
          config.useOauthClient && config.oauth_client_id.trim()
            ? config.oauth_client_id.trim()
            : null,
        oauth_client_secret:
          config.useOauthClient && config.oauth_client_secret.trim()
            ? config.oauth_client_secret.trim()
            : null,
        source_kind: source.source_kind,
        source_url: source.source_url.trim(),
        tool_prefix: config.tool_prefix.trim(),
      },
      {
        onError: (error) => {
          const message = apiErrorMessage(error);
          setImportError(message);
          toast.error(`Import failed: ${message}`);
        },
        onSuccess: (result) => {
          setImportResult(result);
          toast.success(
            `Imported ${result.connector.id} with ${result.connector.action_count} action(s)`
          );
        },
      }
    );
  };

  const canPreview =
    source.source_url.trim().length > 0 && !previewMutation.isPending;
  // Listed next to the Import button so a disabled state explains itself.
  const importBlockers = [
    ...(preview?.import_blockers ?? []),
    preview === null ? "preview" : null,
    preview !== null && selectedActions.size === 0 ? "selected actions" : null,
    source.domain.trim().length > 0 ? null : "domain",
    config.id.trim().length >= 2 ? null : "connector id",
    config.tool_prefix.trim().length >= 2 ? null : "tool prefix",
  ].filter((item): item is string => item !== null);

  const canImport = importBlockers.length === 0 && !importMutation.isPending;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-semibold text-lg">Import a connector</h2>
        <p className="text-muted-foreground text-sm">
          Find a service in the integrations registry or paste an OpenAPI spec /
          MCP server URL, preview its actions, then import.
        </p>
      </div>

      <Card className="space-y-4" variant="form">
        <Tabs defaultValue="registry">
          <TabsList variant="line">
            <TabsTrigger value="registry">Registry search</TabsTrigger>
            <TabsTrigger value="manual">Manual URL</TabsTrigger>
          </TabsList>
          <TabsContent className="pt-3" value="registry">
            <RegistrySearchPanel onPick={handlePickResult} />
          </TabsContent>
          <TabsContent className="pt-3" value="manual">
            <ManualSourceFields onChange={applySource} source={source} />
          </TabsContent>
        </Tabs>

        {discoverMutation.isPending ? (
          // div, not p: Spinner renders block elements (invalid inside <p>).
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner className="size-4" />
            Resolving importable sources…
          </div>
        ) : null}
        {wizardError ? (
          <p className="text-destructive text-sm">{wizardError}</p>
        ) : null}
        {discovered && discovered.domain === source.domain.trim() ? (
          discovered.sources.length > 0 ? (
            <DiscoveredSourcesPanel
              activeSourceUrl={source.source_url}
              onPick={handlePickDiscoveredSource}
              sources={discovered.sources}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              The registry knows {discovered.domain} but lists no importable
              spec or MCP URLs — paste a spec or MCP endpoint URL on the Manual
              URL tab instead.
            </p>
          )
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground text-xs">Source</div>
            <div className="truncate text-sm">
              {source.source_url ? (
                <>
                  <KindBadge kind={source.source_kind} />{" "}
                  <span className="align-middle">{source.source_url}</span>
                  {source.domain ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {source.domain}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">
                  Pick a registry result or paste a URL.
                </span>
              )}
            </div>
          </div>
          <Button
            disabled={!canPreview}
            onClick={handlePreview}
            type="button"
            variant="outline"
          >
            {previewMutation.isPending ? <Spinner className="size-4" /> : null}
            Preview
          </Button>
        </div>

        {preview ? (
          <>
            <PreviewPanel
              onSelectedChange={setSelectedActions}
              preview={preview}
              selected={selectedActions}
            />
            <ConfigForm
              config={config}
              onChange={setConfig}
              suggestsOauth={suggestsOauthClient(preview.security_schemes)}
            />
            <div className="flex items-center justify-end gap-3">
              <span className="text-muted-foreground text-sm">
                {importBlockers.length > 0
                  ? `Missing: ${importBlockers.join(", ")}`
                  : `${selectedActions.size}/${preview.actions.length} actions selected`}
              </span>
              <Button
                disabled={!canImport}
                onClick={handleImport}
                type="button"
              >
                {importMutation.isPending ? (
                  <Spinner className="size-4" />
                ) : null}
                Import connector
              </Button>
            </div>
          </>
        ) : null}

        {importError ? (
          <p className="text-destructive text-sm">{importError}</p>
        ) : null}
        {importResult ? <ImportResultPanel result={importResult} /> : null}
      </Card>
    </div>
  );
}

function DiscoveredSourcesPanel({
  activeSourceUrl,
  onPick,
  sources,
}: {
  activeSourceUrl: string;
  onPick: (entry: DiscoveredSource) => void;
  sources: DiscoveredSource[];
}) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-xs">Discovered sources</div>
      <ul className="divide-y rounded-md border">
        {sources.map((entry) => {
          const active = entry.source_url === activeSourceUrl;
          const blocked = entry.blocked_reason !== null;
          return (
            <li
              className="space-y-1 p-2"
              key={`${entry.surface.slug}:${entry.source_url}`}
            >
              <div className="flex items-center gap-3">
                <KindBadge kind={entry.surface.kind} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-sm">
                    {entry.surface.name ?? entry.surface.slug}
                  </span>{" "}
                  <span className="font-mono text-muted-foreground text-xs">
                    {entry.surface.slug}
                  </span>
                </span>
                {entry.transport ? (
                  <Badge variant="secondary">{entry.transport}</Badge>
                ) : null}
                {entry.surface.auth_status === "unknown" ? null : (
                  <Badge variant="outline">
                    auth: {entry.surface.auth_status}
                  </Badge>
                )}
                <Button
                  disabled={active || blocked}
                  onClick={() => onPick(entry)}
                  size="sm"
                  type="button"
                  variant={active ? "secondary" : "outline"}
                >
                  {active ? "Selected" : "Select"}
                </Button>
              </div>
              {entry.source_url ? (
                <div className="truncate font-mono text-muted-foreground text-xs">
                  {entry.source_url}
                </div>
              ) : null}
              {entry.surface.spec_override_count > 0 ? (
                <div className="text-muted-foreground text-xs">
                  {entry.surface.spec_override_count} registry spec
                  correction(s) will be applied before import.
                </div>
              ) : null}
              {entry.blocked_reason ? (
                <p className="text-amber-600 text-xs dark:text-amber-500">
                  {entry.blocked_reason}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Only openapi/mcp surfaces with a URL can seed an import. */
function isPickableSearchSurface(surface: RegistrySearchSurface): boolean {
  return (
    Boolean(surface.url) &&
    (surface.kind === "openapi" || surface.kind === "mcp")
  );
}

function RegistrySearchPanel({
  onPick,
}: {
  onPick: (
    result: RegistrySearchResult,
    surface?: RegistrySearchSurface
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | ExternalSourceKind>("all");
  const searchMutation = useMutation({
    mutationFn: (input: { kind: "all" | ExternalSourceKind; query: string }) =>
      searchRegistry({
        kind: input.kind === "all" ? null : input.kind,
        query: input.query,
      }),
  });

  const handleSearch = () => {
    if (!query.trim()) {
      return;
    }
    searchMutation.mutate({ kind, query: query.trim() });
  };

  const results = searchMutation.data?.results ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-48 flex-1"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSearch();
            }
          }}
          placeholder="Search the integrations registry (e.g. sentry, linear)"
          value={query}
        />
        <Select
          onValueChange={(value) =>
            setKind(value as "all" | ExternalSourceKind)
          }
          value={kind}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any kind</SelectItem>
            <SelectItem value="openapi">openapi</SelectItem>
            <SelectItem value="mcp">mcp</SelectItem>
          </SelectContent>
        </Select>
        <Button
          disabled={searchMutation.isPending || !query.trim()}
          onClick={handleSearch}
          type="button"
          variant="outline"
        >
          {searchMutation.isPending ? (
            <Spinner className="size-4" />
          ) : (
            <Search className="size-4" />
          )}
          Search
        </Button>
      </div>

      {searchMutation.isError ? (
        <p className="text-destructive text-sm">
          Search failed: {apiErrorMessage(searchMutation.error)}
        </p>
      ) : null}
      {searchMutation.isSuccess && results.length === 0 ? (
        <p className="text-muted-foreground text-sm">No results.</p>
      ) : null}
      {results.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {results.map((result) => (
            <li
              className="space-y-2 p-3"
              key={`${result.domain}:${result.url}`}
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{result.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {result.domain}
                    </span>
                    {result.kinds.map((k) => (
                      <KindBadge key={k} kind={k} />
                    ))}
                  </div>
                  {result.description ? (
                    <p className="truncate text-muted-foreground text-sm">
                      {result.description}
                    </p>
                  ) : null}
                </div>
                <Button
                  onClick={() => onPick(result)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Use
                </Button>
              </div>
              {/* Catalog surfaces are pickable straight from the hit: they
                  carry the connect/spec URL, so no discover round trip is
                  needed to start a preview. */}
              {result.surfaces.filter(isPickableSearchSurface).length > 0 ? (
                <ul className="space-y-1">
                  {result.surfaces
                    .filter(isPickableSearchSurface)
                    .map((surface) => (
                      <li
                        className="flex items-center gap-2"
                        key={`${result.domain}:${surface.slug}`}
                      >
                        <KindBadge kind={surface.kind} />
                        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs">
                          {surface.url}
                        </span>
                        {surface.auth?.kind ? (
                          <Badge variant="secondary">{surface.auth.kind}</Badge>
                        ) : null}
                        <Button
                          onClick={() => onPick(result, surface)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Use this surface
                        </Button>
                      </li>
                    ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Confident kind inference from a source URL; null when ambiguous. */
function inferSourceKind(url: string): ExternalSourceKind | null {
  const value = url.trim().toLowerCase();
  if (/\/mcp\/?(\?|$)/u.test(value) || /^https?:\/\/mcp\./u.test(value)) {
    return "mcp";
  }
  if (/\.(json|ya?ml)(\?|$)/u.test(value) || /openapi|swagger/u.test(value)) {
    return "openapi";
  }
  return null;
}

function ManualSourceFields({
  onChange,
  source,
}: {
  onChange: (next: WizardSource) => void;
  source: WizardSource;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_10rem_14rem]">
      <div className="space-y-1">
        <Label htmlFor="external-source-url">Source URL</Label>
        <Input
          id="external-source-url"
          onChange={(event) => {
            const url = event.target.value;
            // Infer the kind on URL edits only — an explicit pick in the
            // dropdown afterwards is never overridden by other field edits.
            onChange({
              ...source,
              source_kind: inferSourceKind(url) ?? source.source_kind,
              source_url: url,
            });
          }}
          placeholder="https://example.com/openapi.json or MCP server URL"
          value={source.source_url}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="external-source-kind">Kind</Label>
        <Select
          onValueChange={(value) =>
            onChange({ ...source, source_kind: value as ExternalSourceKind })
          }
          value={source.source_kind}
        >
          <SelectTrigger className="w-full" id="external-source-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openapi">openapi</SelectItem>
            <SelectItem value="mcp">mcp</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="external-source-domain">Domain</Label>
        <Input
          id="external-source-domain"
          onChange={(event) =>
            onChange({ ...source, domain: event.target.value })
          }
          placeholder="example.com"
          value={source.domain}
        />
      </div>
    </div>
  );
}

function PreviewPanel({
  onSelectedChange,
  preview,
  selected,
}: {
  onSelectedChange: (next: Set<string>) => void;
  preview: SourcePreview;
  selected: Set<string>;
}) {
  const allSelected = selected.size === preview.actions.length;

  const toggleAll = () => {
    onSelectedChange(
      allSelected
        ? new Set()
        : new Set(preview.actions.map((action) => action.id))
    );
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectedChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {preview.title ?? "Untitled source"}
        </span>
        {preview.base_url ? (
          <span className="text-muted-foreground text-sm">
            {preview.base_url}
          </span>
        ) : null}
        {preview.surface ? (
          <Badge variant="secondary">
            registry surface {preview.surface.slug}
          </Badge>
        ) : preview.discover_found ? (
          <Badge variant="secondary">registry facts found</Badge>
        ) : null}
      </div>

      {preview.import_blockers.length > 0 ? (
        <div className="space-y-1 rounded-md border border-destructive/50 p-2">
          <p className="font-medium text-destructive text-sm">
            This source cannot be imported yet:
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-destructive text-sm">
            {preview.import_blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview.applied_overrides > 0 ? (
        <p className="text-muted-foreground text-sm">
          {preview.applied_overrides} registry spec correction(s) applied before
          normalization.
        </p>
      ) : null}

      {preview.surface && preview.surface.required_headers.length > 0 ? (
        <div className="space-y-1">
          <div className="text-muted-foreground text-xs">
            Headers sent on every request
          </div>
          <ul className="rounded-md border text-sm">
            {preview.surface.required_headers.map((header) => (
              <li className="flex items-baseline gap-2 p-2" key={header.name}>
                <span className="font-mono text-xs">{header.name}</span>
                <span className="font-mono text-muted-foreground text-xs">
                  {header.value ?? `(from ${header.source_kind})`}
                </span>
                {header.description ? (
                  <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
                    {header.description}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview.dropped_count > 0 ? (
        <p className="text-amber-600 text-sm dark:text-amber-500">
          {preview.dropped_count} action(s) dropped by the per-connector cap.
        </p>
      ) : null}
      {preview.skipped.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-amber-600 dark:text-amber-500">
            {preview.skipped.length} action(s) skipped during normalization
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {preview.skipped.map((entry) => (
              <li key={entry.id}>
                <span className="font-mono">{entry.id}</span>: {entry.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="max-h-80 overflow-y-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  aria-label="Select all actions"
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.actions.map((action) => (
              <TableRow key={action.id}>
                <TableCell>
                  <Checkbox
                    aria-label={`Include ${action.id}`}
                    checked={selected.has(action.id)}
                    onCheckedChange={() => toggleOne(action.id)}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">{action.id}</TableCell>
                <TableCell>
                  <ClassificationBadge classification={action.classification} />
                </TableCell>
                <TableCell className="max-w-[320px] truncate text-muted-foreground text-sm">
                  {action.summary || action.description}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ConfigForm({
  config,
  onChange,
  suggestsOauth,
}: {
  config: WizardConfig;
  onChange: (next: WizardConfig) => void;
  suggestsOauth: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="external-import-id">Connector id</Label>
          <Input
            id="external-import-id"
            onChange={(event) =>
              onChange({ ...config, id: event.target.value })
            }
            placeholder="kebab-case, e.g. sentry-io"
            value={config.id}
          />
          <p className="text-muted-foreground text-xs">
            Stable kebab-case identifier; becomes the settings URL
            (/settings/connections/…). Not changeable after import.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="external-import-prefix">Tool prefix</Label>
          <Input
            id="external-import-prefix"
            onChange={(event) =>
              onChange({ ...config, tool_prefix: event.target.value })
            }
            placeholder="snake_case, e.g. sentry"
            value={config.tool_prefix}
          />
          <p className="text-muted-foreground text-xs">
            Short snake_case prefix for agent tool names, e.g. deepwiki →
            deepwiki_ask_question. Unique across all connectors.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="external-import-name">Name</Label>
          <Input
            id="external-import-name"
            onChange={(event) =>
              onChange({ ...config, name: event.target.value })
            }
            placeholder="Display name"
            value={config.name}
          />
          <p className="text-muted-foreground text-xs">
            Display name shown in the connections consoles and to agents.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="external-import-base-url">Base URL</Label>
          <Input
            id="external-import-base-url"
            onChange={(event) =>
              onChange({ ...config, base_url: event.target.value })
            }
            placeholder="Defaults from the spec"
            value={config.base_url}
          />
          <p className="text-muted-foreground text-xs">
            API server the actions call — only for OpenAPI imports (defaults
            from the spec's servers). Ignored for MCP.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={config.useOauthClient}
          id="external-import-oauth"
          onCheckedChange={(checked) =>
            onChange({ ...config, useOauthClient: checked })
          }
        />
        <Label htmlFor="external-import-oauth">
          OAuth client credentials
          {suggestsOauth ? (
            <span className="ml-2 text-muted-foreground text-xs">
              (spec declares OAuth security)
            </span>
          ) : null}
        </Label>
      </div>

      {config.useOauthClient ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="external-import-client-id">OAuth client id</Label>
            <Input
              autoComplete="off"
              id="external-import-client-id"
              onChange={(event) =>
                onChange({ ...config, oauth_client_id: event.target.value })
              }
              value={config.oauth_client_id}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="external-import-client-secret">
              OAuth client secret
            </Label>
            <Input
              autoComplete="off"
              id="external-import-client-secret"
              onChange={(event) =>
                onChange({
                  ...config,
                  oauth_client_secret: event.target.value,
                })
              }
              type="password"
              value={config.oauth_client_secret}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ImportResultPanel({ result }: { result: ImportConnectorResult }) {
  return (
    <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
      <p className="font-medium">
        Imported “{result.connector.name}” ({result.connector.action_count}{" "}
        actions).
      </p>
      {result.warnings.map((warning) => (
        <p className="text-amber-600 dark:text-amber-500" key={warning}>
          {warning}
        </p>
      ))}
      {result.skipped_actions.length > 0 ? (
        <p className="text-amber-600 dark:text-amber-500">
          Skipped at registration: {result.skipped_actions.join(", ")}
        </p>
      ) : null}
      <p className="text-muted-foreground">
        The connector now appears in the connections console for every tenant.
      </p>
    </div>
  );
}
