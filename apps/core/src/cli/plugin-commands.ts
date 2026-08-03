import { listWorkspaceModuleSlugsOnDisk } from "@engenty/environment";
import type { Command } from "commander";
import { CliApiError } from "./auth-sdk.js";
import { runCliAction } from "./cli-errors.js";
import {
  callCoreApi,
  callCoreApiWithAcceptedStatuses,
  defaultApiUrl,
} from "./core-api.js";
import {
  applyLocalDbMigrations,
  DB_MIGRATE_NEXT_STEP,
  isLocalDbReachable,
  restartLocalDb,
} from "./db/db-commands.js";
import { registerPluginCreateCommand } from "./plugin-create-command.js";
import {
  type PluginListItem,
  resolvePluginIdsFromArgsOrPrompt,
} from "./plugin-id-prompt.js";
import { pickWorkspaceSlugs } from "./plugins/pick-workspace-plugins.js";
import {
  disablePluginsInProduct,
  enablePluginsInProduct,
  listPluginManifestEntries,
  type PluginManifestEntry,
  resolveRepoRoot,
} from "./plugins/plugins-manifest-ops.js";
import { isInteractiveTerminal } from "./select-loop.js";

interface PluginCommandOpts {
  apiUrl?: string;
  json?: boolean;
  tenant?: string;
  token?: string;
}

interface PackageLifecycleCommandOpts extends PluginCommandOpts {
  confirmPackageMutation?: boolean;
  packageSpec?: string;
}

interface ApiSuccess<T> {
  data: T;
  ok: true;
}

interface ApiError {
  error: {
    code?: string;
    details?: unknown;
    message: string;
  };
  ok: false;
}

type ApiPayload<T> = ApiSuccess<T> | ApiError | T;

interface PackageLifecycleResult {
  commandPlan?: {
    args?: string[];
    command?: string;
  };
  executionAvailable?: boolean;
  issues?: Array<{
    code?: string;
    level?: string;
    message?: string;
  }>;
  mutationPlan?: {
    executionMode?: string;
    packageManager?: string;
    packageSpec?: string;
  };
  nextSteps?: string[];
  operation?: string;
  pluginId?: string;
  status?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Narrow to the error envelope. `isObject(payload) && payload.ok === false`
 * only proves the payload is *an object* — it leaves `error` as `unknown`,
 * so reading `.details` off it was untyped.
 */
function isApiError(value: unknown): value is ApiError {
  return isObject(value) && value.ok === false && isObject(value.error);
}

function unwrapApiData<T>(payload: ApiPayload<T>): T {
  if (isObject(payload) && payload.ok === true && "data" in payload) {
    return payload.data as T;
  }
  return payload as T;
}

function extractLifecycleResult(
  payload: ApiPayload<PackageLifecycleResult>
): PackageLifecycleResult {
  if (isApiError(payload)) {
    return isObject(payload.error.details)
      ? (payload.error.details as PackageLifecycleResult)
      : {
          status: "failed",
          nextSteps: [payload.error.message],
        };
  }
  return unwrapApiData(payload);
}

function tenantQuery(opts: PluginCommandOpts) {
  return opts.tenant ? `?tenantId=${encodeURIComponent(opts.tenant)}` : "";
}

/**
 * After installing in-repo workspace modules (which aggregates their migrations
 * but never applies them), either apply locally on opt-in or print the next
 * step. Keep apply opt-in and local-only: install must stay DB-free for CI,
 * fresh checkouts, and remote/unreachable databases.
 */
function finishInRepoInstall(opts: {
  dbMigrate?: boolean;
  dbRestart?: boolean;
}): void {
  if (opts.dbMigrate !== true && opts.dbRestart !== true) {
    console.log(DB_MIGRATE_NEXT_STEP);
    return;
  }
  if (!isLocalDbReachable()) {
    console.log(
      "Skipped --db-migrate/--db-restart: no local database reachable (start one with `supabase start`)."
    );
    console.log(DB_MIGRATE_NEXT_STEP);
    return;
  }
  if (opts.dbMigrate === true) {
    console.log("Applying module migrations to the local database…");
    applyLocalDbMigrations();
  }
  // Restart last: applying migrations creates the schema's tables, then the
  // restart makes the API serve the newly exposed schema from config.toml.
  if (opts.dbRestart === true) {
    restartLocalDb();
  }
}

function actionBody(opts: PluginCommandOpts) {
  return opts.tenant ? { tenant_id: opts.tenant } : {};
}

function statusLabel(plugin: PluginListItem) {
  if (plugin.enabled === false) {
    return "disabled";
  }
  if (plugin.loaded === false) {
    return "enabled/unloaded";
  }
  return "enabled";
}

function formatTable(rows: string[][]) {
  const widths = rows[0].map((_, index) =>
    Math.max(...rows.map((row) => row[index]?.length ?? 0))
  );
  return rows
    .map((row) =>
      row
        .map((cell, index) => cell.padEnd(widths[index]))
        .join("  ")
        .trimEnd()
    )
    .join("\n");
}

/**
 * A plugin row combining disk discovery (always available) with live runtime
 * state from the core API (only present when the API is reachable).
 */
export interface MergedPluginRow {
  enabled: boolean;
  hasUi: boolean;
  key: string;
  live?: PluginListItem;
  onDisk: boolean;
}

/** True when the API could not be reached at all (vs. an HTTP error response). */
function isApiUnreachable(error: unknown): boolean {
  return error instanceof CliApiError && error.status === 0;
}

/**
 * Merge disk-discovered plugins with live API state. Disk is the base set;
 * live entries enrich matching rows (by id == slug) and contribute any
 * package-backed plugins that exist only at runtime.
 */
export function mergePlugins(
  disk: PluginManifestEntry[],
  live?: PluginListItem[]
): MergedPluginRow[] {
  const byKey = new Map<string, MergedPluginRow>();
  for (const entry of disk) {
    byKey.set(entry.slug, {
      key: entry.slug,
      onDisk: entry.onDisk,
      enabled: entry.enabled,
      hasUi: entry.hasUi,
    });
  }
  for (const item of live ?? []) {
    const existing = byKey.get(item.id);
    if (existing) {
      existing.live = item;
      if (item.enabled !== undefined) {
        existing.enabled = item.enabled;
      }
    } else {
      byKey.set(item.id, {
        key: item.id,
        onDisk: false,
        enabled: item.enabled ?? false,
        hasUi: false,
        live: item,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function formatPluginList(rows: MergedPluginRow[]) {
  if (rows.length === 0) {
    return "No plugins found.";
  }
  const hasLive = rows.some((row) => row.live);
  const header = hasLive
    ? ["PLUGIN", "ON-DISK", "ENABLED", "UI", "STATUS", "VERSION", "PACKAGE"]
    : ["PLUGIN", "ON-DISK", "ENABLED", "UI"];
  return formatTable([
    header,
    ...rows.map((row) => {
      const base = [
        row.key,
        row.onDisk ? "yes" : "no",
        row.enabled ? "yes" : "no",
        row.hasUi ? "yes" : "no",
      ];
      if (!hasLive) {
        return base;
      }
      return [
        ...base,
        row.live ? statusLabel(row.live) : "-",
        row.live?.version ?? "-",
        row.live?.packageName ?? "-",
      ];
    }),
  ]);
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

function printPackageLifecycleResult(result: PackageLifecycleResult) {
  const lines = [
    `${result.operation ?? "package"} ${result.status ?? "unknown"}: ${result.pluginId ?? "unknown plugin"}`,
  ];
  if (result.mutationPlan) {
    const plan = result.mutationPlan;
    lines.push(
      `mutation: ${plan.packageManager ?? "package-manager"} ${plan.executionMode ?? "unknown"} ${plan.packageSpec ?? ""}`.trim()
    );
  }
  if (result.commandPlan?.command && result.commandPlan.args) {
    lines.push(
      `command: ${result.commandPlan.command} ${result.commandPlan.args.join(" ")}`
    );
  }
  if (result.issues?.length) {
    lines.push("issues:");
    for (const issue of result.issues) {
      lines.push(
        `- ${issue.level ?? "info"} ${issue.code ?? "unknown"}: ${issue.message ?? ""}`.trim()
      );
    }
  }
  if (result.nextSteps?.length) {
    lines.push("next steps:");
    for (const step of result.nextSteps) {
      lines.push(`- ${step}`);
    }
  }
  console.log(lines.join("\n"));
}

async function invokePackageLifecycleRequest(params: {
  body: Record<string, unknown>;
  endpoint: string;
  opts: PackageLifecycleCommandOpts;
}): Promise<ApiPayload<PackageLifecycleResult>> {
  return callCoreApiWithAcceptedStatuses<ApiPayload<PackageLifecycleResult>>(
    params.opts,
    "POST",
    params.endpoint,
    params.body,
    [409]
  );
}

async function runPackageLifecycleCommand(params: {
  body: Record<string, unknown>;
  endpoint: string;
  opts: PackageLifecycleCommandOpts;
}) {
  const payload = await invokePackageLifecycleRequest(params);
  if (params.opts.json) {
    printJson(payload);
    return;
  }
  printPackageLifecycleResult(extractLifecycleResult(payload));
}

export function registerPluginCommands(program: Command): void {
  const plugins = program
    .command("plugins")
    .description("Manage Engenty plugins");

  registerPluginCreateCommand(plugins);

  plugins
    .command("list")
    .description(
      "List plugins discovered on disk, enriched with live runtime state when the API is reachable"
    )
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT")
    .option("--tenant <id>", "Tenant ID for effective plugin state")
    .option("--json", "Print raw JSON response")
    .action(
      runCliAction(async (opts: PluginCommandOpts) => {
        const diskEntries = listPluginManifestEntries(resolveRepoRoot());

        let liveItems: PluginListItem[] | undefined;
        try {
          const payload = await callCoreApi<ApiPayload<PluginListItem[]>>(
            opts,
            "GET",
            `/api/plugins${tenantQuery(opts)}`
          );
          liveItems = unwrapApiData(payload);
        } catch (error) {
          // Disk is the source of truth; the API only enriches. A reachability
          // failure is non-fatal, but real HTTP errors (401/403/…) still bubble.
          if (!isApiUnreachable(error)) {
            throw error;
          }
        }

        const rows = mergePlugins(diskEntries, liveItems);

        if (opts.json) {
          printJson({ apiAvailable: liveItems !== undefined, plugins: rows });
          return;
        }

        if (liveItems === undefined) {
          console.error(
            "API not reachable — showing plugins on disk only. Start the API for live runtime state (status, version, tenant overrides)."
          );
        }
        console.log(formatPluginList(rows));
      })
    );

  plugins
    .command("activate")
    .description("Activate a plugin globally or for a tenant")
    .argument("[id]", "Plugin ID (interactive pick when omitted)")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT")
    .option("--tenant <id>", "Tenant ID for tenant-scoped activation")
    .option("--json", "Print raw JSON response")
    .action(async (id: string | undefined, opts: PluginCommandOpts) => {
      const resolved = await resolvePluginIdsFromArgsOrPrompt({
        id,
        json: opts.json === true,
        opts,
        verb: "activate",
      });
      if (resolved === "cancelled") {
        return;
      }
      const results: unknown[] = [];
      for (const pluginId of resolved) {
        const payload = await callCoreApi<ApiPayload<unknown>>(
          opts,
          "POST",
          `/api/plugins/${encodeURIComponent(pluginId)}/activate`,
          actionBody(opts)
        );
        results.push(opts.json ? payload : unwrapApiData(payload));
      }
      if (opts.json) {
        printJson(results);
        return;
      }
      if (results.length === 1) {
        printJson(results[0]);
        return;
      }
      printJson({ plugins: resolved, results });
    });

  plugins
    .command("deactivate")
    .description("Deactivate a plugin globally or for a tenant")
    .argument("[id]", "Plugin ID (interactive pick when omitted)")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT")
    .option("--tenant <id>", "Tenant ID for tenant-scoped deactivation")
    .option("--json", "Print raw JSON response")
    .action(async (id: string | undefined, opts: PluginCommandOpts) => {
      const resolved = await resolvePluginIdsFromArgsOrPrompt({
        id,
        json: opts.json === true,
        opts,
        verb: "deactivate",
      });
      if (resolved === "cancelled") {
        return;
      }
      const results: unknown[] = [];
      for (const pluginId of resolved) {
        const payload = await callCoreApi<ApiPayload<unknown>>(
          opts,
          "POST",
          `/api/plugins/${encodeURIComponent(pluginId)}/deactivate`,
          actionBody(opts)
        );
        results.push(opts.json ? payload : unwrapApiData(payload));
      }
      if (opts.json) {
        printJson(results);
        return;
      }
      if (results.length === 1) {
        printJson(results[0]);
        return;
      }
      printJson({ plugins: resolved, results });
    });

  plugins
    .command("install")
    .description(
      "Install plugin(s) into the product — in-repo workspace modules by slug (manifest + setup), or external packages by spec (via the core API)"
    )
    .argument(
      "[target...]",
      "Workspace module slug(s) and/or external package spec(s)"
    )
    .option("--all", "Install every workspace module on disk (in-repo)")
    .option(
      "--db-migrate",
      "After installing in-repo modules, apply their migrations to the local database (opt-in; local + reachable only)"
    )
    .option(
      "--db-restart",
      "After installing in-repo modules, restart the local Supabase stack so the API serves their newly exposed schemas (opt-in; local + reachable only; pair with --db-migrate)"
    )
    .option(
      "--api-url <url>",
      "API base URL (external packages)",
      defaultApiUrl
    )
    .option("--token <token>", "Bearer JWT (external packages)")
    .option(
      "--confirm-package-mutation",
      "Allow the API to run pnpm mutation (external packages)"
    )
    .option("--json", "Print raw JSON response")
    .action(
      runCliAction(
        async (
          targets: string[],
          opts: PackageLifecycleCommandOpts & {
            all?: boolean;
            dbMigrate?: boolean;
            dbRestart?: boolean;
          }
        ) => {
          const repoRoot = resolveRepoRoot();
          const workspaceSlugs = new Set(
            listWorkspaceModuleSlugsOnDisk(repoRoot)
          );

          // No targets and no --all → interactively pick installable workspace
          // modules (on disk, not yet installed).
          if (targets.length === 0 && opts.all !== true) {
            if (opts.json) {
              throw new Error(
                "Provide a target (slug or package spec) or --all with --json."
              );
            }
            if (!isInteractiveTerminal()) {
              throw new Error(
                "Provide a workspace module slug, an external package spec, or pass --all."
              );
            }
            const installable = listPluginManifestEntries(repoRoot).filter(
              (e) => e.onDisk && !e.enabled
            );
            if (installable.length === 0) {
              console.log("All workspace plugins are already installed.");
              return;
            }
            const picked = await pickWorkspaceSlugs({
              entries: installable,
              verb: "install",
            });
            if (picked === "cancelled") {
              return;
            }
            const result = enablePluginsInProduct({ repoRoot, slugs: picked });
            for (const message of result.messages) {
              console.log(message);
            }
            finishInRepoInstall(opts);
            return;
          }

          const inRepo =
            opts.all === true
              ? [...workspaceSlugs]
              : targets.filter((t) => workspaceSlugs.has(t));
          const external =
            opts.all === true
              ? []
              : targets.filter((t) => !workspaceSlugs.has(t));

          if (inRepo.length === 0 && external.length === 0) {
            throw new Error("Nothing to install.");
          }

          if (inRepo.length > 0) {
            const result = enablePluginsInProduct({ repoRoot, slugs: inRepo });
            for (const message of result.messages) {
              console.log(message);
            }
            finishInRepoInstall(opts);
          }
          for (const spec of external) {
            await runPackageLifecycleCommand({
              body: {
                confirm_package_mutation: opts.confirmPackageMutation === true,
                package_spec: spec,
              },
              endpoint: `/api/plugins/${encodeURIComponent(spec)}/install`,
              opts,
            });
          }
        }
      )
    );

  plugins
    .command("update")
    .description(
      "Plan or run package-backed plugin update through the core API"
    )
    .argument("[id]", "Plugin ID (interactive pick when omitted)")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT")
    .option("--package-spec <spec>", "npm package name or package@version")
    .option("--confirm-package-mutation", "Allow the API to run pnpm mutation")
    .option("--json", "Print raw JSON response")
    .action(
      async (id: string | undefined, opts: PackageLifecycleCommandOpts) => {
        const resolved = await resolvePluginIdsFromArgsOrPrompt({
          id,
          json: opts.json === true,
          opts,
          verb: "update",
        });
        if (resolved === "cancelled") {
          return;
        }
        const payloads: ApiPayload<PackageLifecycleResult>[] = [];
        for (const pluginId of resolved) {
          payloads.push(
            await invokePackageLifecycleRequest({
              body: {
                confirm_package_mutation: opts.confirmPackageMutation === true,
                ...(opts.packageSpec ? { package_spec: opts.packageSpec } : {}),
              },
              endpoint: `/api/plugins/${encodeURIComponent(pluginId)}/update`,
              opts,
            })
          );
        }
        if (opts.json) {
          printJson(payloads);
          return;
        }
        for (const payload of payloads) {
          printPackageLifecycleResult(extractLifecycleResult(payload));
        }
      }
    );

  plugins
    .command("uninstall")
    .description(
      "Uninstall plugin(s) from the product — in-repo workspace modules by slug (manifest + setup), or external packages by id (via the core API)"
    )
    .argument(
      "[target...]",
      "Workspace module slug(s) and/or external plugin id(s)"
    )
    .option(
      "--api-url <url>",
      "API base URL (external packages)",
      defaultApiUrl
    )
    .option("--token <token>", "Bearer JWT (external packages)")
    .option(
      "--confirm-package-mutation",
      "Allow the API to run pnpm mutation (external packages)"
    )
    .option("--json", "Print raw JSON response")
    .action(
      runCliAction(
        async (targets: string[], opts: PackageLifecycleCommandOpts) => {
          const repoRoot = resolveRepoRoot();
          const workspaceSlugs = new Set(
            listWorkspaceModuleSlugsOnDisk(repoRoot)
          );

          // No targets → interactively pick from installed workspace plugins.
          if (targets.length === 0) {
            if (opts.json) {
              throw new Error("Provide a target (slug or id) with --json.");
            }
            if (!isInteractiveTerminal()) {
              throw new Error("Provide plugin slug(s) / id(s) to uninstall.");
            }
            const installed = listPluginManifestEntries(repoRoot).filter(
              (e) => e.enabled
            );
            if (installed.length === 0) {
              console.log("No workspace plugins are installed.");
              return;
            }
            const picked = await pickWorkspaceSlugs({
              entries: installed,
              verb: "uninstall",
            });
            if (picked === "cancelled") {
              return;
            }
            const result = disablePluginsInProduct({ repoRoot, slugs: picked });
            for (const message of result.messages) {
              console.log(message);
            }
            return;
          }

          const inRepo = targets.filter((t) => workspaceSlugs.has(t));
          const external = targets.filter((t) => !workspaceSlugs.has(t));

          if (inRepo.length > 0) {
            const result = disablePluginsInProduct({ repoRoot, slugs: inRepo });
            for (const message of result.messages) {
              console.log(message);
            }
          }
          for (const id of external) {
            await runPackageLifecycleCommand({
              body: {
                confirm_package_mutation: opts.confirmPackageMutation === true,
              },
              endpoint: `/api/plugins/${encodeURIComponent(id)}/uninstall`,
              opts,
            });
          }
        }
      )
    );
}
