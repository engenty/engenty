import type { ConnectorDefinition } from "@engenty/connections-sdk";
import { defineConnector } from "@engenty/connections-sdk";
import { z } from "zod";
import { action } from "./action.js";
import { graphJson, graphRaw, MICROSOFT_OAUTH2 } from "./graph.js";

const MAX_SEARCH_TOP = 25;
const MAX_CONTENT_CHARS = 50_000;

const ITEM_SELECT = "id,name,file,folder,size,lastModifiedDateTime,webUrl";

interface GraphDriveItem {
  file?: { mimeType?: string | null } | null;
  folder?: { childCount?: number | null } | null;
  id?: string;
  lastModifiedDateTime?: string | null;
  name?: string | null;
  parentReference?: { id?: string | null; path?: string | null } | null;
  size?: number | null;
  webUrl?: string | null;
}

function mapItem(item: GraphDriveItem) {
  return {
    childCount: item.folder?.childCount ?? null,
    id: item.id,
    isFolder: Boolean(item.folder),
    lastModifiedDateTime: item.lastModifiedDateTime ?? null,
    mimeType: item.file?.mimeType ?? null,
    name: item.name ?? null,
    size: item.size ?? null,
    webUrl: item.webUrl ?? null,
  };
}

const TEXTISH_MIME_PREFIXES = ["text/"];
const TEXTISH_MIME_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/javascript",
  "application/typescript",
  "application/x-javascript",
  "application/xml",
  "application/x-sh",
  "application/x-yaml",
  "application/yaml",
  "application/csv",
  "application/sql",
  "application/rtf",
  "image/svg+xml",
]);

function isTextishMimeType(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase().split(";")[0].trim();
  return (
    TEXTISH_MIME_PREFIXES.some((p) => normalized.startsWith(p)) ||
    TEXTISH_MIME_TYPES.has(normalized) ||
    normalized.endsWith("+json") ||
    normalized.endsWith("+xml")
  );
}

export const microsoftOneDriveConnector: ConnectorDefinition = defineConnector({
  actions: [
    // ── read ────────────────────────────────────────────────────────────
    action({
      description:
        "Search files and folders across the user's OneDrive by name/content query.",
      group: "read",
      id: "search_files",
      inputSchema: z.object({
        q: z.string().describe("Search text (matches names and file content)."),
        top: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_TOP)
          .optional()
          .describe("Max results to return (1–25, default 10)."),
      }),
      providerScopes: ["Files.Read"],
      run: async (input, ctx) => {
        const top = Math.min(Math.max(input.top ?? 10, 1), MAX_SEARCH_TOP);
        const q = encodeURIComponent(input.q.replace(/'/g, "''"));
        const data = await graphJson<{ value?: GraphDriveItem[] }>(
          ctx,
          `/me/drive/root/search(q='${q}')?$top=${top}&$select=${ITEM_SELECT}`
        );
        return { items: (data.value ?? []).map(mapItem) };
      },
      summary: "Search OneDrive files",
    }),
    action({
      description:
        "Get metadata for a single OneDrive item (file or folder) by id.",
      group: "read",
      id: "get_item",
      inputSchema: z.object({
        item_id: z.string().describe("OneDrive item id."),
      }),
      providerScopes: ["Files.Read"],
      run: async (input, ctx) => {
        const item = await graphJson<GraphDriveItem>(
          ctx,
          `/me/drive/items/${encodeURIComponent(input.item_id)}?$select=${ITEM_SELECT},parentReference`
        );
        return {
          ...mapItem(item),
          parent: item.parentReference
            ? {
                id: item.parentReference.id ?? null,
                path: item.parentReference.path ?? null,
              }
            : null,
        };
      },
      summary: "Get a OneDrive item",
    }),
    action({
      description:
        "List the children of a OneDrive folder (defaults to the drive root).",
      group: "read",
      id: "list_children",
      inputSchema: z.object({
        item_id: z
          .string()
          .optional()
          .describe("Folder item id. Omit to list the drive root."),
        top: z
          .number()
          .int()
          .min(1)
          .max(MAX_SEARCH_TOP)
          .optional()
          .describe("Max children to return (1–25, default 25)."),
      }),
      providerScopes: ["Files.Read"],
      run: async (input, ctx) => {
        const top = Math.min(
          Math.max(input.top ?? MAX_SEARCH_TOP, 1),
          MAX_SEARCH_TOP
        );
        const base = input.item_id
          ? `/me/drive/items/${encodeURIComponent(input.item_id)}/children`
          : "/me/drive/root/children";
        const data = await graphJson<{ value?: GraphDriveItem[] }>(
          ctx,
          `${base}?$top=${top}&$select=${ITEM_SELECT}`
        );
        return { items: (data.value ?? []).map(mapItem) };
      },
      summary: "List OneDrive folder children",
    }),
    action({
      description:
        "Read the content of a text-like OneDrive file (capped at ~50KB). Office documents are not converted — their webUrl is returned instead.",
      group: "read",
      id: "read_file_content",
      inputSchema: z.object({
        item_id: z.string().describe("OneDrive file item id."),
      }),
      providerScopes: ["Files.Read"],
      run: async (input, ctx) => {
        const encodedId = encodeURIComponent(input.item_id);
        const item = await graphJson<GraphDriveItem>(
          ctx,
          `/me/drive/items/${encodedId}?$select=${ITEM_SELECT}`
        );
        if (item.folder) {
          throw new Error(
            "read_file_content: item is a folder — use list_children instead"
          );
        }
        const mimeType = item.file?.mimeType ?? "";
        if (!mimeType || !isTextishMimeType(mimeType)) {
          return {
            id: item.id,
            mimeType: mimeType || null,
            name: item.name ?? null,
            reason:
              "File content is not plain text (e.g. an Office document or binary). Open it via webUrl instead.",
            supported: false,
            webUrl: item.webUrl ?? null,
          };
        }
        const res = await graphRaw(ctx, `/me/drive/items/${encodedId}/content`);
        const text = await res.text();
        const truncated = text.length > MAX_CONTENT_CHARS;
        return {
          content: truncated ? text.slice(0, MAX_CONTENT_CHARS) : text,
          id: item.id,
          mimeType,
          name: item.name ?? null,
          size: item.size ?? null,
          supported: true,
          truncated,
        };
      },
      summary: "Read a OneDrive text file's content",
    }),
    // ── write ───────────────────────────────────────────────────────────
    action({
      description:
        "Upload (create or overwrite) a text file in OneDrive under the given parent folder.",
      group: "write",
      id: "upload_file",
      inputSchema: z.object({
        content_text: z.string().describe("File content (plain text)."),
        name: z
          .string()
          .describe("File name including extension (e.g. notes.md)."),
        parent_id: z
          .string()
          .default("root")
          .describe('Parent folder item id (default "root").'),
      }),
      providerScopes: ["Files.ReadWrite"],
      run: async (input, ctx) => {
        const encodedName = encodeURIComponent(input.name);
        const path =
          input.parent_id === "root"
            ? `/me/drive/root:/${encodedName}:/content`
            : `/me/drive/items/${encodeURIComponent(input.parent_id)}:/${encodedName}:/content`;
        const res = await graphRaw(ctx, path, {
          body: input.content_text,
          contentType: "text/plain",
          method: "PUT",
        });
        const item = (await res.json()) as GraphDriveItem;
        return mapItem(item);
      },
      summary: "Upload a text file to OneDrive",
    }),
  ],
  auth: { kind: "oauth2", oauth2: MICROSOFT_OAUTH2 },
  description:
    "OneDrive files via Microsoft Graph: search, browse, read text file content, and upload text files.",
  icon: "folder",
  id: "microsoft-onedrive",
  moduleId: "connections-microsoft",
  name: "Microsoft OneDrive",
  toolPrefix: "onedrive",
});
