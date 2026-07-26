/**
 * Sync target resolution. The bucket and an optional in-bucket path prefix are
 * read from `pluginConfig` (set per deployment), falling back to sensible
 * defaults. Keys are always tenant + KB scoped so a single bucket can hold
 * every KB across every tenant without collisions.
 */

export interface KbSyncConfig {
  bucket: string;
  pathPrefix: string;
}

const DEFAULT_BUCKET = "kb-sync";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveKbSyncConfig(
  pluginConfig: Record<string, unknown> | undefined
): KbSyncConfig {
  return {
    bucket: asString(pluginConfig?.bucket) ?? DEFAULT_BUCKET,
    // Empty by default — keys start at `<tenant>/<kb>/…`.
    pathPrefix: (asString(pluginConfig?.path_prefix) ?? "").replace(
      /^\/+|\/+$/g,
      ""
    ),
  };
}

/** Base prefix for one KB: `<pathPrefix?>/<tenantId>/<kbId>`. */
export function kbBasePrefix(
  config: KbSyncConfig,
  tenantId: string,
  kbId: string
): string {
  return [config.pathPrefix, tenantId, kbId].filter(Boolean).join("/");
}
