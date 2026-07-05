import {
  type ConnectorActionContext,
  type ConnectorDefinition,
  type ConnectorFileEntry,
  type ConnectorFilesListResult,
  defineConnector,
} from "@engenty/connections-sdk";
import { AwsClient } from "aws4fetch";
import { XMLParser } from "fast-xml-parser";

/** Credentials JSON stored encrypted in the connection's token column. */
export interface S3Credentials {
  access_key_id: string;
  bucket: string;
  /** Custom endpoint for R2/MinIO; default AWS regional endpoint. */
  endpoint?: string;
  /** Optional key prefix acting as the connection's root (e.g. "projects/"). */
  prefix?: string;
  region: string;
  secret_access_key: string;
}

const PRESIGN_TTL_SECONDS = 300;

const xml = new XMLParser({ ignoreAttributes: true });

function parseCredentials(accessToken: string): S3Credentials {
  let parsed: Partial<S3Credentials>;
  try {
    parsed = JSON.parse(accessToken) as Partial<S3Credentials>;
  } catch {
    throw new Error("s3_credentials_invalid: stored credentials are not JSON");
  }
  if (
    !(
      parsed.access_key_id &&
      parsed.secret_access_key &&
      parsed.region &&
      parsed.bucket
    )
  ) {
    throw new Error("s3_credentials_invalid: missing required fields");
  }
  return parsed as S3Credentials;
}

function normalizedPrefix(creds: S3Credentials): string {
  const prefix = (creds.prefix ?? "").replace(/^\/+/, "");
  if (!prefix) {
    return "";
  }
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function bucketUrl(creds: S3Credentials): string {
  const endpoint =
    creds.endpoint?.replace(/\/+$/, "") ??
    `https://s3.${creds.region}.amazonaws.com`;
  return `${endpoint}/${creds.bucket}`;
}

function clientFor(creds: S3Credentials): AwsClient {
  return new AwsClient({
    accessKeyId: creds.access_key_id,
    region: creds.region,
    secretAccessKey: creds.secret_access_key,
    service: "s3",
  });
}

async function s3Fetch(
  ctx: ConnectorActionContext,
  creds: S3Credentials,
  url: string,
  init?: { method?: string }
): Promise<Response> {
  const client = clientFor(creds);
  const signed = await client.sign(url, { method: init?.method ?? "GET" });
  const res = await ctx.fetchImpl(signed);
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    throw new Error(`s3_api_error (${res.status}): ${body}`);
  }
  return res;
}

interface ListedObject {
  Key?: string;
  LastModified?: string;
  Size?: number | string;
}

interface ListBucketResult {
  CommonPrefixes?: { Prefix?: string } | { Prefix?: string }[];
  Contents?: ListedObject | ListedObject[];
  IsTruncated?: boolean | string;
  NextContinuationToken?: string;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/**
 * Parse a ListObjectsV2 response into normalized entries. `root` is the
 * connection's configured prefix; refs are keys relative to it (folders carry a
 * trailing slash so they round-trip as prefixes).
 */
export function parseListResponse(
  body: string,
  root: string
): ConnectorFilesListResult {
  const doc = xml.parse(body) as { ListBucketResult?: ListBucketResult };
  const result = doc.ListBucketResult ?? {};
  const entries: ConnectorFileEntry[] = [];
  for (const cp of asArray(result.CommonPrefixes)) {
    const full = cp.Prefix ?? "";
    if (!full.startsWith(root)) {
      continue;
    }
    const rel = full.slice(root.length);
    entries.push({
      kind: "folder",
      mime_type: null,
      modified_at: null,
      name: rel.replace(/\/$/, "").split("/").pop() ?? rel,
      ref: rel,
      size: null,
    });
  }
  for (const obj of asArray(result.Contents)) {
    const full = obj.Key ?? "";
    if (!full.startsWith(root)) {
      continue;
    }
    const rel = full.slice(root.length);
    // The prefix marker object of the folder itself has an empty relative key.
    if (!rel || rel.endsWith("/")) {
      continue;
    }
    entries.push({
      kind: "file",
      mime_type: null,
      modified_at: obj.LastModified ?? null,
      name: rel.split("/").pop() ?? rel,
      ref: rel,
      size: obj.Size === undefined ? null : Number(obj.Size),
    });
  }
  return {
    entries,
    next_cursor: result.NextContinuationToken ?? null,
  };
}

/** Verify credentials with a 1-key list and resolve the account label. */
export async function verifyS3Credentials(
  raw: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<{ externalId?: string; label: string }> {
  const creds = parseCredentials(JSON.stringify(raw));
  const root = normalizedPrefix(creds);
  const url = new URL(bucketUrl(creds));
  url.searchParams.set("list-type", "2");
  url.searchParams.set("max-keys", "1");
  if (root) {
    url.searchParams.set("prefix", root);
  }
  const signed = await clientFor(creds).sign(url.toString(), {
    method: "GET",
  });
  const res = await fetchImpl(signed);
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`s3_verify_failed (${res.status}): ${body}`);
  }
  const label = root
    ? `${creds.bucket}/${root.replace(/\/$/, "")}`
    : creds.bucket;
  return { externalId: label, label };
}

export const s3Connector: ConnectorDefinition = defineConnector({
  actions: [],
  auth: {
    kind: "api_key",
    apiKey: {
      fields: [
        { key: "access_key_id", label: "Access key ID" },
        { key: "secret_access_key", label: "Secret access key", secret: true },
        { key: "region", label: "Region", placeholder: "eu-central-1" },
        { key: "bucket", label: "Bucket" },
        {
          key: "endpoint",
          label: "Endpoint",
          placeholder: "https://… (only for R2/MinIO)",
          required: false,
        },
        {
          key: "prefix",
          label: "Key prefix",
          placeholder: "optional root folder",
          required: false,
        },
      ],
      verify: verifyS3Credentials,
    },
  },
  description:
    "Browse and read objects in an S3-compatible bucket (AWS S3, Cloudflare R2, MinIO). Read-only.",
  files: {
    rootLabel: (connection) => connection.external_account ?? "S3 bucket",

    async list(ctx, input) {
      const creds = parseCredentials(ctx.accessToken);
      const root = normalizedPrefix(creds);
      const folder = input.folder_ref ?? "";
      const url = new URL(bucketUrl(creds));
      url.searchParams.set("list-type", "2");
      url.searchParams.set("delimiter", "/");
      url.searchParams.set("prefix", `${root}${folder}`);
      url.searchParams.set("max-keys", String(input.limit ?? 100));
      if (input.cursor) {
        url.searchParams.set("continuation-token", input.cursor);
      }
      const res = await s3Fetch(ctx, creds, url.toString());
      return parseListResponse(await res.text(), root);
    },

    async read(ctx, input) {
      const creds = parseCredentials(ctx.accessToken);
      const root = normalizedPrefix(creds);
      const key = `${root}${input.file_ref}`;
      // HEAD first for size/mime, then presign a GET — no proxying, no cap.
      const headUrl = `${bucketUrl(creds)}/${key
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      const head = await s3Fetch(ctx, creds, headUrl, { method: "HEAD" });
      const size = Number(head.headers.get("content-length") ?? "0") || null;
      const mime = head.headers.get("content-type");
      const presigned = await clientFor(creds).sign(
        `${headUrl}?X-Amz-Expires=${PRESIGN_TTL_SECONDS}`,
        { aws: { signQuery: true }, method: "GET" }
      );
      return {
        expires_at: new Date(
          Date.now() + PRESIGN_TTL_SECONDS * 1000
        ).toISOString(),
        kind: "url" as const,
        mime_type: mime,
        name: input.file_ref.split("/").pop() ?? input.file_ref,
        size,
        url: presigned.url,
      };
    },

    async search(ctx, input) {
      const creds = parseCredentials(ctx.accessToken);
      const root = normalizedPrefix(creds);
      const scope = input.folder_ref ?? "";
      const url = new URL(bucketUrl(creds));
      url.searchParams.set("list-type", "2");
      url.searchParams.set("prefix", `${root}${scope}`);
      url.searchParams.set("max-keys", "1000");
      const res = await s3Fetch(ctx, creds, url.toString());
      const listing = parseListResponse(await res.text(), root);
      const q = input.query.toLowerCase();
      const limit = input.limit ?? 100;
      return {
        entries: listing.entries
          .filter((entry) => entry.name.toLowerCase().includes(q))
          .slice(0, limit),
        next_cursor: null,
      };
    },

    async stat(ctx, input) {
      const creds = parseCredentials(ctx.accessToken);
      const root = normalizedPrefix(creds);
      if (!input.ref || input.ref.endsWith("/")) {
        return {
          kind: "folder",
          mime_type: null,
          modified_at: null,
          name: input.ref.replace(/\/$/, "").split("/").pop() ?? "",
          ref: input.ref,
          size: null,
        };
      }
      const key = `${root}${input.ref}`;
      const headUrl = `${bucketUrl(creds)}/${key
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      const head = await s3Fetch(ctx, creds, headUrl, { method: "HEAD" });
      return {
        kind: "file",
        mime_type: head.headers.get("content-type"),
        modified_at: head.headers.get("last-modified")
          ? new Date(head.headers.get("last-modified") as string).toISOString()
          : null,
        name: input.ref.split("/").pop() ?? input.ref,
        ref: input.ref,
        size: Number(head.headers.get("content-length") ?? "0") || null,
      };
    },
  },
  icon: "🪣",
  id: "s3",
  moduleId: "connections-s3",
  name: "S3 Bucket",
  toolPrefix: "s3",
});
