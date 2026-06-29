import type { Command } from "commander";
import {
  callCoreApi,
  callCoreApiWithAcceptedStatuses,
  defaultApiUrl,
} from "./core-api.js";
import { registerPluginCreateCommand } from "./plugin-create-command.js";
import {
  type PluginListItem,
  resolvePluginIdsFromArgsOrPrompt,
} from "./plugin-id-prompt.js";
import { registerPluginWireUiCommand } from "./plugin-wire-ui-command.js";

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

function unwrapApiData<T>(payload: ApiPayload<T>): T {
  if (isObject(payload) && payload.ok === true && "data" in payload) {
    return payload.data as T;
  }
  return payload as T;
}

function extractLifecycleResult(
  payload: ApiPayload<PackageLifecycleResult>
): PackageLifecycleResult {
  if (isObject(payload) && payload.ok === false) {
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

export function formatPluginList(plugins: PluginListItem[]) {
  if (plugins.length === 0) {
    return "No plugins found.";
  }
  return formatTable([
    ["ID", "STATUS", "LOADED", "SOURCE", "VERSION", "PACKAGE"],
    ...plugins.map((plugin) => [
      plugin.id,
      statusLabel(plugin),
      plugin.loaded === false ? "no" : "yes",
      plugin.sourceType ?? "-",
      plugin.version ?? "-",
      plugin.packageName ?? "-",
    ]),
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
  registerPluginWireUiCommand(plugins);

  plugins
    .command("list")
    .description("List discovered plugins")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT")
    .option("--tenant <id>", "Tenant ID for effective plugin state")
    .option("--json", "Print raw JSON response")
    .action(async (opts: PluginCommandOpts) => {
      const payload = await callCoreApi<ApiPayload<PluginListItem[]>>(
        opts,
        "GET",
        `/api/plugins${tenantQuery(opts)}`
      );
      if (opts.json) {
        printJson(payload);
        return;
      }
      console.log(formatPluginList(unwrapApiData(payload)));
    });

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
      "Plan or run package-backed plugin installation through the core API"
    )
    .argument("<package-spec>", "npm package name or package@version")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT")
    .option("--confirm-package-mutation", "Allow the API to run pnpm mutation")
    .option("--json", "Print raw JSON response")
    .action(async (packageSpec: string, opts: PackageLifecycleCommandOpts) => {
      await runPackageLifecycleCommand({
        body: {
          confirm_package_mutation: opts.confirmPackageMutation === true,
          package_spec: packageSpec,
        },
        endpoint: `/api/plugins/${encodeURIComponent(packageSpec)}/install`,
        opts,
      });
    });

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
      "Plan or run package-backed plugin uninstall through the core API"
    )
    .argument("[id]", "Plugin ID (interactive pick when omitted)")
    .option("--api-url <url>", "API base URL", defaultApiUrl)
    .option("--token <token>", "Bearer JWT")
    .option("--confirm-package-mutation", "Allow the API to run pnpm mutation")
    .option("--json", "Print raw JSON response")
    .action(
      async (id: string | undefined, opts: PackageLifecycleCommandOpts) => {
        const resolved = await resolvePluginIdsFromArgsOrPrompt({
          id,
          json: opts.json === true,
          opts,
          verb: "uninstall",
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
              },
              endpoint: `/api/plugins/${encodeURIComponent(pluginId)}/uninstall`,
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
}
