import type { TenantSettingRow } from "@engenty/tenant-settings";

export type {
  TenantSettingType,
  TenantSettingValue,
  TenantSettingValueOut,
} from "@engenty/tenant-settings";

/** Extra dimensions beyond tenant_id + scope_id (e.g. `{ kb_id: "…" }`). Use `{}` for scope-wide keys. */
export type ScopedKvContext = Record<string, unknown>;

export type ScopedKvSettingRow = TenantSettingRow & {
  context: ScopedKvContext;
};
