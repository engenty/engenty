import {
  type ConnectorDefinition,
  type ConnectorFileEntry,
  type ConnectorFilesListResult,
  type ConnectorFilesReadResult,
  defineConnector,
} from "@engenty/connections-sdk";
import { runBridgeAction } from "./bridge/server.js";
import type {
  LocalFileEntry,
  LocalListResult,
  LocalReadResult,
  LocalSearchResult,
} from "./protocol.js";
import type { LocalFilesRepo } from "./repo.js";

function toEntry(entry: LocalFileEntry): ConnectorFileEntry {
  return {
    kind: entry.kind === "directory" ? "folder" : "file",
    mime_type: null,
    modified_at: entry.modified_at,
    name: entry.name,
    ref: entry.path,
    size: entry.size,
  };
}

/**
 * The local-files connector holds no server-side secret (auth kind `browser`).
 * Its files capability round-trips each call into the browser tab that granted
 * the directory; the synthesized `local_files_*` read actions and files-module
 * mounts both flow through here.
 */
export function createLocalFilesConnector(deps: {
  /** Tenant-locked repo factory; each file action resolves on the connection
   * row's own tenant (the row was read on the caller's handle upstream). */
  getRepo: (auth: { tenantId: string }) => LocalFilesRepo;
}): ConnectorDefinition {
  const { getRepo } = deps;

  return defineConnector({
    actions: [],
    auth: { kind: "browser" },
    description:
      "Read files and folders from a local directory the user granted in their browser.",
    files: {
      rootLabel: (connection) =>
        connection.display_name ??
        connection.external_account ??
        "Local folder",

      async list(ctx, input): Promise<ConnectorFilesListResult> {
        const result = (await runBridgeAction({
          action: "list",
          connection: ctx.connection,
          input: {
            limit: input.limit,
            path: input.folder_ref ?? "",
          },
          log: ctx.log,
          repo: getRepo({ tenantId: ctx.connection.tenant_id }),
        })) as LocalListResult;
        return {
          entries: result.entries.map(toEntry),
          next_cursor: null,
        };
      },

      async read(ctx, input): Promise<ConnectorFilesReadResult> {
        const result = (await runBridgeAction({
          action: "read",
          connection: ctx.connection,
          input: { max_bytes: input.max_bytes, path: input.file_ref },
          log: ctx.log,
          repo: getRepo({ tenantId: ctx.connection.tenant_id }),
        })) as LocalReadResult;
        if (result.encoding === "base64") {
          return {
            content_base64: result.content_base64,
            kind: "base64",
            mime_type: null,
            name: null,
            size: result.size,
            truncated: false,
          };
        }
        return {
          content: result.content,
          kind: "text",
          mime_type: null,
          name: null,
          size: result.size,
          truncated: false,
        };
      },

      async search(ctx, input): Promise<ConnectorFilesListResult> {
        const result = (await runBridgeAction({
          action: "search",
          connection: ctx.connection,
          input: {
            limit: input.limit,
            path: input.folder_ref ?? "",
            query: input.query,
          },
          log: ctx.log,
          repo: getRepo({ tenantId: ctx.connection.tenant_id }),
        })) as LocalSearchResult;
        return {
          entries: result.matches.map(toEntry),
          next_cursor: null,
        };
      },

      async stat(ctx, input): Promise<ConnectorFileEntry> {
        const entry = (await runBridgeAction({
          action: "stat",
          connection: ctx.connection,
          input: { path: input.ref },
          log: ctx.log,
          repo: getRepo({ tenantId: ctx.connection.tenant_id }),
        })) as LocalFileEntry;
        return toEntry(entry);
      },
    },
    icon: "📁",
    id: "local-files",
    moduleId: "connections-local-files",
    name: "Local Files",
    toolPrefix: "local",
  });
}
