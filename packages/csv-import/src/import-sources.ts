/**
 * Module-declared import sources: CSV upload (always) plus connections that can
 * produce tabular rows for a domain (secrets / contacts / team).
 */

export type ImportDomain = "secrets" | "contacts" | "team";

export type ImportSourceKind = "csv_file" | "connection";

export type ConnectionFetchMode = "pick_file" | "list_records";

export interface ConnectionImportSource {
  connectorId: string;
  domains: ImportDomain[];
  /** How a connected account becomes ParsedCSV rows. */
  fetchMode: ConnectionFetchMode;
  kind: "connection";
  /**
   * Action id for `list_records` (e.g. `list_contacts`). Combined with the
   * catalog connector's `tool_prefix` → `gcontacts_list_contacts`.
   */
  listActionId?: string;
  requiresCapability: "files" | "action";
}

/** File-capable connectors shared by secrets / contacts / team. */
export const FILE_CONNECTION_IMPORT_SOURCES: ConnectionImportSource[] = [
  {
    kind: "connection",
    connectorId: "google-drive",
    domains: ["secrets", "contacts", "team"],
    requiresCapability: "files",
    fetchMode: "pick_file",
  },
  {
    kind: "connection",
    connectorId: "microsoft-onedrive",
    domains: ["secrets", "contacts", "team"],
    requiresCapability: "files",
    fetchMode: "pick_file",
  },
  {
    kind: "connection",
    connectorId: "local-files",
    domains: ["secrets", "contacts", "team"],
    requiresCapability: "files",
    fetchMode: "pick_file",
  },
  {
    kind: "connection",
    connectorId: "s3",
    domains: ["secrets", "contacts", "team"],
    requiresCapability: "files",
    fetchMode: "pick_file",
  },
];

/** Typed CRM / people connectors (contacts domain only). */
export const TYPED_CONNECTION_IMPORT_SOURCES: ConnectionImportSource[] = [
  {
    kind: "connection",
    connectorId: "google-contacts",
    domains: ["contacts"],
    requiresCapability: "action",
    fetchMode: "list_records",
    listActionId: "list_contacts",
  },
  {
    kind: "connection",
    connectorId: "hubspot",
    domains: ["contacts"],
    requiresCapability: "action",
    fetchMode: "list_records",
    listActionId: "list_contacts",
  },
];

export const ALL_CONNECTION_IMPORT_SOURCES: ConnectionImportSource[] = [
  ...FILE_CONNECTION_IMPORT_SOURCES,
  ...TYPED_CONNECTION_IMPORT_SOURCES,
];

/** Sources registered for a module domain (file + typed). */
export function connectionImportSourcesForDomain(
  domain: ImportDomain,
  extras: ConnectionImportSource[] = []
): ConnectionImportSource[] {
  const base =
    domain === "contacts"
      ? ALL_CONNECTION_IMPORT_SOURCES
      : FILE_CONNECTION_IMPORT_SOURCES;
  const merged = [...base, ...extras];
  const byId = new Map<string, ConnectionImportSource>();
  for (const source of merged) {
    if (source.domains.includes(domain)) {
      byId.set(source.connectorId, source);
    }
  }
  return [...byId.values()];
}

/** MIME / extension filter for importable connection files. */
export function isImportableConnectionFile(entry: {
  kind: string;
  mimeType?: string | null;
  name: string;
}): boolean {
  if (entry.kind !== "file") {
    return false;
  }
  const mime = (entry.mimeType ?? "").toLowerCase();
  if (
    mime === "text/csv" ||
    mime === "text/tab-separated-values" ||
    mime === "text/plain" ||
    mime === "application/vnd.google-apps.spreadsheet"
  ) {
    return true;
  }
  const lower = entry.name.toLowerCase();
  return (
    lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")
  );
}
