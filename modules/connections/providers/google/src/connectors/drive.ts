import {
  type ConnectorDefinition,
  defineConnector,
} from "@engenty/connections-sdk";
import { z } from "zod";
import {
  connectorAction,
  GOOGLE_OAUTH2,
  googleFetch,
  googleJson,
} from "../shared.js";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

const SCOPE_READONLY = "https://www.googleapis.com/auth/drive.readonly";
const SCOPE_FILE = "https://www.googleapis.com/auth/drive.file";

/** ~50KB cap on file content returned to agents. */
const MAX_CONTENT_CHARS = 50_000;

interface DriveFile {
  createdTime?: string;
  id: string;
  mimeType?: string;
  modifiedTime?: string;
  name?: string;
  owners?: { displayName?: string; emailAddress?: string }[];
  parents?: string[];
  size?: string;
  webViewLink?: string;
}

function toFileSummary(f: DriveFile) {
  return {
    id: f.id,
    mime_type: f.mimeType ?? null,
    modified_time: f.modifiedTime ?? null,
    name: f.name ?? null,
    size: f.size ? Number(f.size) : null,
    web_view_link: f.webViewLink ?? null,
  };
}

/** Escape a value for use inside single quotes in a Drive query. */
function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Export MIME type for Google Workspace documents, or null if not exportable as text. */
function exportMimeFor(mimeType: string): string | null {
  switch (mimeType) {
    case "application/vnd.google-apps.document":
    case "application/vnd.google-apps.presentation":
      return "text/plain";
    case "application/vnd.google-apps.spreadsheet":
      return "text/csv";
    default:
      return null;
  }
}

export const driveConnector: ConnectorDefinition = defineConnector({
  actions: [
    connectorAction({
      description:
        "Search Google Drive files by a Drive query expression and/or a name substring. Returns id, name, MIME type, modified time, size and web link.",
      group: "read",
      handler: async (input, ctx) => {
        const qParts = ["trashed = false"];
        if (input.query) {
          qParts.push(`(${input.query})`);
        }
        if (input.name_contains) {
          qParts.push(
            `name contains '${escapeDriveQueryValue(input.name_contains)}'`
          );
        }
        const url = new URL(`${DRIVE_API}/files`);
        url.searchParams.set("q", qParts.join(" and "));
        url.searchParams.set("pageSize", String(input.page_size ?? 10));
        url.searchParams.set(
          "fields",
          "files(id,name,mimeType,modifiedTime,size,webViewLink)"
        );
        const data = await googleJson<{ files?: DriveFile[] }>(
          ctx,
          url.toString()
        );
        return { files: (data.files ?? []).map(toFileSummary) };
      },
      id: "search_files",
      inputSchema: z.object({
        name_contains: z
          .string()
          .optional()
          .describe("Only return files whose name contains this substring."),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe("Maximum number of files to return (1-25, default 10)."),
        query: z
          .string()
          .optional()
          .describe(
            "Raw Drive query expression (https://developers.google.com/drive/api/guides/search-files), e.g. \"mimeType = 'application/pdf' and modifiedTime > '2026-01-01T00:00:00'\"."
          ),
      }),
      providerScopes: [SCOPE_READONLY],
      summary: "Search Google Drive files",
    }),
    connectorAction({
      description:
        "Fetch metadata for a Google Drive file: name, MIME type, size, timestamps, owners, parent folder and web link.",
      group: "read",
      handler: async (input, ctx) => {
        const f = await googleJson<DriveFile>(
          ctx,
          `${DRIVE_API}/files/${encodeURIComponent(input.file_id)}?fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink,parents,owners(displayName,emailAddress)`
        );
        return {
          ...toFileSummary(f),
          created_time: f.createdTime ?? null,
          owners: (f.owners ?? []).map((o) => ({
            display_name: o.displayName ?? null,
            email: o.emailAddress ?? null,
          })),
          parents: f.parents ?? [],
        };
      },
      id: "get_file_metadata",
      inputSchema: z.object({
        file_id: z.string().describe("Google Drive file id."),
      }),
      providerScopes: [SCOPE_READONLY],
      summary: "Get Drive file metadata",
    }),
    connectorAction({
      description:
        "Read the text content of a Google Drive file. Plain text and JSON files are downloaded directly; Google Docs/Slides are exported as plain text and Google Sheets as CSV. Output is capped at ~50KB (truncated flag set when cut off).",
      group: "read",
      handler: async (input, ctx) => {
        const meta = await googleJson<DriveFile>(
          ctx,
          `${DRIVE_API}/files/${encodeURIComponent(input.file_id)}?fields=id,name,mimeType,size`
        );
        const mimeType = meta.mimeType ?? "application/octet-stream";
        const exportMime = mimeType.startsWith("application/vnd.google-apps")
          ? exportMimeFor(mimeType)
          : null;
        let res: Response;
        if (exportMime) {
          res = await googleFetch(
            ctx,
            `${DRIVE_API}/files/${encodeURIComponent(input.file_id)}/export?mimeType=${encodeURIComponent(exportMime)}`
          );
        } else if (
          mimeType.startsWith("text/") ||
          mimeType === "application/json"
        ) {
          res = await googleFetch(
            ctx,
            `${DRIVE_API}/files/${encodeURIComponent(input.file_id)}?alt=media`
          );
        } else {
          throw new Error(
            `google_drive_unsupported_type: cannot read "${mimeType}" as text. Supported: text/*, application/json, Google Docs, Sheets and Slides.`
          );
        }
        const text = await res.text();
        const truncated = text.length > MAX_CONTENT_CHARS;
        return {
          content: truncated ? text.slice(0, MAX_CONTENT_CHARS) : text,
          export_mime_type: exportMime,
          file_id: meta.id,
          mime_type: mimeType,
          name: meta.name ?? null,
          truncated,
        };
      },
      id: "read_file_content",
      inputSchema: z.object({
        file_id: z
          .string()
          .describe(
            "Google Drive file id. Must be a text-like file (text/*, JSON) or a Google Doc/Sheet/Slides."
          ),
      }),
      providerScopes: [SCOPE_READONLY],
      summary: "Read Drive file content as text",
    }),
    connectorAction({
      description:
        "Create a new file in Google Drive from text content, optionally inside a specific folder.",
      group: "write",
      handler: async (input, ctx) => {
        const mimeType = input.mime_type ?? "text/plain";
        const metadata = {
          mimeType,
          name: input.name,
          ...(input.folder_id ? { parents: [input.folder_id] } : {}),
        };
        const boundary = `engenty_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
        const body = [
          `--${boundary}`,
          "Content-Type: application/json; charset=UTF-8",
          "",
          JSON.stringify(metadata),
          `--${boundary}`,
          `Content-Type: ${mimeType}; charset=UTF-8`,
          "",
          input.content_text,
          `--${boundary}--`,
        ].join("\r\n");
        const created = await googleJson<DriveFile>(
          ctx,
          `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink`,
          {
            body,
            headers: {
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            method: "POST",
          }
        );
        return {
          file_id: created.id,
          mime_type: created.mimeType ?? mimeType,
          name: created.name ?? input.name,
          web_view_link: created.webViewLink ?? null,
        };
      },
      id: "create_file",
      inputSchema: z.object({
        content_text: z.string().describe("Text content of the new file."),
        folder_id: z
          .string()
          .optional()
          .describe(
            "Optional Drive folder id to create the file in (default: My Drive root)."
          ),
        mime_type: z
          .string()
          .optional()
          .describe(
            'MIME type of the file content (default "text/plain"; e.g. "text/markdown", "text/csv", "application/json").'
          ),
        name: z.string().describe("File name, including extension."),
      }),
      providerScopes: [SCOPE_FILE],
      summary: "Create a file in Google Drive",
    }),
  ],
  auth: { kind: "oauth2", oauth2: GOOGLE_OAUTH2 },
  description:
    "Search, read and create files in a connected Google Drive account.",
  icon: "logo:google-drive",
  id: "google-drive",
  moduleId: "connections-google",
  name: "Google Drive",
  toolPrefix: "gdrive",
});
