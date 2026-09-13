import { runMultiSelectLoop } from "@engenty/cli";
import { callCoreApi } from "./core-api.js";

export interface PluginListItem {
  dbHealth?: string;
  enabled?: boolean;
  globalEnabled?: boolean;
  id: string;
  loaded?: boolean;
  name?: string;
  packageName?: string;
  sourceType?: string;
  tenantOverride?: boolean | null;
  version?: string;
}

interface PluginCommandOpts {
  apiUrl?: string;
  json?: boolean;
  tenant?: string;
  token?: string;
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrapApiData<T>(payload: ApiPayload<T>): T {
  if (isObject(payload) && payload.ok === true && "data" in payload) {
    return payload.data as T;
  }
  return payload as T;
}

function tenantQuery(opts: PluginCommandOpts) {
  return opts.tenant ? `?tenantId=${encodeURIComponent(opts.tenant)}` : "";
}

export function statusLabel(plugin: PluginListItem) {
  if (plugin.enabled === false) {
    return "disabled";
  }
  if (plugin.loaded === false) {
    return "enabled/unloaded";
  }
  return "enabled";
}

/** Plugin is on and loaded (runtime-active). */
export function isPluginActive(plugin: PluginListItem): boolean {
  if (plugin.enabled === false) {
    return false;
  }
  return plugin.loaded === true;
}

export async function fetchPluginsList(
  opts: PluginCommandOpts
): Promise<PluginListItem[]> {
  const payload = await callCoreApi<ApiPayload<PluginListItem[]>>(
    opts,
    "GET",
    `/api/plugins${tenantQuery(opts)}`
  );
  return unwrapApiData(payload);
}

export type PluginIdPromptMode = "auto" | "interactive" | "non-interactive";

function isInteractiveTerminal(mode: PluginIdPromptMode): boolean {
  if (mode === "interactive") {
    return true;
  }
  if (mode === "non-interactive") {
    return false;
  }
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function parseExplicitPluginIds(id: string): string[] {
  const parts = id
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(parts)].sort();
}

function runPluginSelectionUi(params: {
  plugins: PluginListItem[];
  verb: string;
}): Promise<string[] | "cancelled"> {
  return runMultiSelectLoop({
    title: "Select plugins",
    doneVerb: params.verb,
    preselect: params.plugins.filter(isPluginActive).map((p) => p.id),
    options: params.plugins.map((p) => ({
      value: p.id,
      label: p.id,
      hint: `${statusLabel(p)} · ${p.sourceType ?? "?"} · ${p.packageName ?? "-"}`,
    })),
  });
}

/**
 * When `id` is missing, interactive TTY: fetch plugins, multiselect with
 * runtime-active plugins pre-checked, plus all / none / invert. Returns
 * sorted unique ids. Comma-separated `id` skips the UI.
 */
export async function resolvePluginIdsFromArgsOrPrompt(params: {
  id: string | undefined;
  json: boolean;
  opts: PluginCommandOpts;
  promptMode?: PluginIdPromptMode;
  verb: string;
}): Promise<string[] | "cancelled"> {
  const trimmed = params.id?.trim();
  if (trimmed) {
    return parseExplicitPluginIds(trimmed);
  }

  if (params.json) {
    throw new Error(
      `Plugin ID is required with --json. Example: engenty plugins ${params.verb} <id> --json`
    );
  }

  const mode = params.promptMode ?? "auto";
  if (!isInteractiveTerminal(mode)) {
    throw new Error(
      `Plugin ID is required in non-interactive mode. Example: engenty plugins ${params.verb} <plugin-id>`
    );
  }

  const plugins = await fetchPluginsList(params.opts);
  if (plugins.length === 0) {
    throw new Error("No plugins returned from API; nothing to select.");
  }

  return runPluginSelectionUi({ plugins, verb: params.verb });
}
