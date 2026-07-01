import { defaultDocumentSourceAdapterRegistry } from "@engenty/document-sources/registry";

/** Human label for a persisted `kb_sources.adapter_id`, falling back to the raw id. */
export function kbAdapterRegistryLabel(
  adapterId: string | null | undefined
): string {
  if (adapterId == null || adapterId === "") {
    return "";
  }
  try {
    return defaultDocumentSourceAdapterRegistry.get(adapterId).descriptor.label;
  } catch {
    return adapterId;
  }
}
