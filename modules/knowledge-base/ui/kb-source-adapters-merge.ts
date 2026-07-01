import { defaultDocumentSourceAdapterRegistry } from "@engenty/document-sources/registry";
import type { KbSourceAdapterDescriptor } from "./api.js";

/** Stable picker order; must match built-in `DocumentSourceAdapterRegistry` ids. */
const KB_SOURCE_ADAPTER_ORDER = [
  "url",
  "firecrawl_url",
  "sitemap",
  "web_index",
  "manual",
  "file_upload",
] as const;

/**
 * Merge `/api/kb/source-adapters` with the in-process registry so the picker always
 * lists every built-in adapter (e.g. `firecrawl_url`) even if the API response is stale
 * or filtered.
 */
export function mergeKbSourceAdaptersForPicker(
  fromApi: KbSourceAdapterDescriptor[] | undefined
): KbSourceAdapterDescriptor[] {
  const byId = new Map<string, KbSourceAdapterDescriptor>();
  for (const d of defaultDocumentSourceAdapterRegistry.listDescriptors()) {
    byId.set(d.id, d as KbSourceAdapterDescriptor);
  }
  if (fromApi?.length) {
    for (const a of fromApi) {
      const base = byId.get(a.id);
      byId.set(
        a.id,
        base
          ? {
              ...base,
              ...a,
              // Built-in field layout comes from the package registry, not a stale API body.
              settings_fields: base.settings_fields,
            }
          : a
      );
    }
  }
  return KB_SOURCE_ADAPTER_ORDER.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}
