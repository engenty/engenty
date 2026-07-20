import {
  type CatalogConnection,
  type CatalogConnector,
  connectionAccountHint,
  invokeConnectionListRecords,
  readConnectionFileSource,
} from "./connection-import-api.js";
import type { ConnectionImportSource } from "./import-sources.js";
import {
  normalizeListRecordsPayload,
  recordsToDelimitedText,
} from "./records-to-csv.js";

/** Pull list_records pages and return delimited text for parseCSV. */
export async function fetchConnectionListRecordsText(params: {
  connection: CatalogConnection;
  connector: CatalogConnector;
  source: ConnectionImportSource;
}): Promise<{ content: string; filename: string }> {
  const { connection, connector, source } = params;
  if (!source.listActionId) {
    throw new Error("This source is not configured for record import");
  }
  const operationId = `${connector.tool_prefix}_${source.listActionId}`;
  const pages: Record<string, string>[] = [];
  let pageToken: string | null = null;
  let pagesFetched = 0;
  do {
    const payload = await invokeConnectionListRecords({
      account: connectionAccountHint(connection),
      input: {
        page_size: 200,
        ...(pageToken ? { page_token: pageToken } : {}),
      },
      operationId,
    });
    pages.push(...normalizeListRecordsPayload(payload));
    const next =
      payload && typeof payload === "object" && "next_page_token" in payload
        ? (payload as { next_page_token: string | null }).next_page_token
        : null;
    pageToken = next;
    pagesFetched += 1;
  } while (pageToken && pagesFetched < 10);

  return {
    content: recordsToDelimitedText(pages),
    filename: `${connector.id}.tsv`,
  };
}

export async function fetchConnectionFileText(params: {
  connectionId: string;
  fileRef: string;
  fallbackName: string;
}): Promise<{ content: string; filename: string }> {
  const result = await readConnectionFileSource(
    params.connectionId,
    params.fileRef
  );
  return {
    content: result.content,
    filename: result.filename || params.fallbackName,
  };
}
