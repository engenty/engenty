import { parseTenantAiSettings, TENANT_AI_CONFIG_KEY } from "@engenty/ai-core";
import {
  assertTenantScopedStorageKey,
  createFileStorageService,
  createSupabaseFileStorageProvider,
  type FileStorageService,
  FileStorageTenantScopeError,
  guessFileStorageMimeFromFilename,
  inboxMessageIdFromFileStorageKey,
  isFileStorageOfficePdfPreviewMime,
  isFileStorageThumbnailSourceMime,
  knowledgePathLabelFromFileStorageKey,
  moduleFolderFromFileStorageKey,
  pathSegmentsAfterFileStorageTenantRoot,
} from "@engenty/file-storage";
import { createLogger } from "@engenty/telemetry";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { createClient } from "@supabase/supabase-js";
import type { Context } from "hono";
import { createDatabaseAdapter } from "../../infra/index.js";
import {
  convertOfficeToPdf,
  isGotenbergConfigured,
} from "../../lib/gotenberg.js";
import { renderPdfFirstPageWebp } from "../../lib/pdf-first-page-webp.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireAuth } from "./authz.js";
import {
  assertKeyInTenant,
  FILE_EXPLORER_BUCKETS,
  FILE_EXPLORER_DEFAULT_BUCKET,
  findTenantBucket,
  relativeToTenantRoot,
  resolveTenantPrefix,
  type TenantBucket,
  TenantScopeViolationError,
} from "./file-storage-tenant-buckets.js";

const logger = createLogger({ name: "file-storage" });

const DEFAULT_BUCKET = FILE_EXPLORER_DEFAULT_BUCKET;

/** Sidecar JSON written next to the original blob (not shown as a separate file in listings). */
const FILE_STORAGE_EXTRACT_SUFFIX = ".extracted.json";

function fileStorageExtractSidecarKey(originalKey: string): string {
  return `${originalKey}${FILE_STORAGE_EXTRACT_SUFFIX}`;
}

function isFileStorageExtractSidecarKey(key: string): boolean {
  return key.endsWith(FILE_STORAGE_EXTRACT_SUFFIX);
}

/** Cached PDF from Gotenberg for office preview (hidden in listings). */
const FILE_STORAGE_PREVIEW_PDF_SUFFIX = ".preview.pdf";

function fileStoragePreviewPdfSidecarKey(originalKey: string): string {
  return `${originalKey}${FILE_STORAGE_PREVIEW_PDF_SUFFIX}`;
}

function isFileStoragePreviewPdfSidecarKey(key: string): boolean {
  return key.endsWith(FILE_STORAGE_PREVIEW_PDF_SUFFIX);
}

/** List thumbnail (first PDF page), hidden in listings. */
const FILE_STORAGE_THUMB_WEBP_SUFFIX = ".thumb.webp";

function fileStorageThumbWebpSidecarKey(originalKey: string): string {
  return `${originalKey}${FILE_STORAGE_THUMB_WEBP_SUFFIX}`;
}

function isFileStorageThumbWebpSidecarKey(key: string): boolean {
  return key.endsWith(FILE_STORAGE_THUMB_WEBP_SUFFIX);
}

function isFileStorageListingHiddenKey(key: string): boolean {
  return (
    isFileStorageExtractSidecarKey(key) ||
    isFileStoragePreviewPdfSidecarKey(key) ||
    isFileStorageThumbWebpSidecarKey(key)
  );
}

async function loadOrCreateOfficePreviewPdf(
  service: FileStorageService,
  key: string,
  filename: string,
  force: boolean
): Promise<
  { ok: true; pdf: Uint8Array } | { ok: false; status: number; message: string }
> {
  if (!isGotenbergConfigured()) {
    return {
      ok: false,
      status: 503,
      message: "PDF preview service not configured (GOTENBERG_URL)",
    };
  }
  const sidecarKey = fileStoragePreviewPdfSidecarKey(key);
  if (!force) {
    try {
      const existing = await service.download(sidecarKey);
      if (existing && existing.byteLength > 0) {
        return { ok: true, pdf: existing };
      }
    } catch {
      /* no sidecar */
    }
  }
  const bytes = await service.download(key);
  if (!bytes || bytes.byteLength === 0) {
    return { ok: false, status: 404, message: "File not found" };
  }
  let pdf: Uint8Array;
  try {
    pdf = await convertOfficeToPdf(bytes, filename);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("File storage office PDF conversion failed", {
      key,
      error: msg,
    });
    return { ok: false, status: 502, message: msg };
  }
  try {
    await service.upload(sidecarKey, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("File storage preview PDF upload failed", {
      key: sidecarKey,
      error: error.message,
    });
    return { ok: false, status: 500, message: error.message };
  }
  return { ok: true, pdf };
}

async function resolveDocConverterConfig(
  config: Record<string, unknown>,
  tenantId: string | null
): Promise<import("@engenty/doc-converter").ConverterConfig | undefined> {
  if (!tenantId) {
    return;
  }
  const adapter = createDatabaseAdapter(config);
  if (!adapter) {
    return;
  }
  const repo = createTenantSettingsRepoSupabase(adapter, tenantId, "default");
  const row = await repo.get(TENANT_AI_CONFIG_KEY);
  const tenantAi = parseTenantAiSettings(row?.value);
  const dc = tenantAi.doc_converter;
  const p = dc?.provider ?? "local";
  return {
    provider:
      p === "llamaparse" ||
      p === "mistral" ||
      p === "gemini" ||
      p === "liteparse" ||
      p === "local"
        ? p
        : "local",
    gemini_model: dc?.gemini_model ?? undefined,
    mistral_model: dc?.mistral_model ?? undefined,
  };
}

/**
 * Folder hint for any storage key: the `/`-delimited prefix after
 * `tenants/<id>/`, excluding the leaf object segment, joined with ` › `.
 * e.g. `files/spaces/project/<id>/<entry>` → `files › spaces › project › <id>`.
 */
function genericPathLabelFromFileStorageKey(key: string): string | undefined {
  const segments = pathSegmentsAfterFileStorageTenantRoot(key);
  const folders = segments.slice(0, -1);
  return folders.length > 0 ? folders.join(" › ") : undefined;
}

function enrichFileStorageFileForApi<T extends { key: string }>(file: T): T {
  const inboxId = inboxMessageIdFromFileStorageKey(file.key);
  if (inboxId) {
    (file as T & { inbox_message_id?: string }).inbox_message_id = inboxId;
  }
  const pathLabel =
    knowledgePathLabelFromFileStorageKey(file.key) ??
    genericPathLabelFromFileStorageKey(file.key);
  if (pathLabel) {
    (file as T & { path_label?: string }).path_label = pathLabel;
  }
  return file;
}

function createFileStorageServiceFactory(config: Record<string, unknown>) {
  const supabaseUrl =
    (config.supabaseUrl as string) || process.env.SUPABASE_URL || "";
  const supabaseServiceRoleKey =
    (config.supabaseServiceRoleKey as string) ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";

  if (!(supabaseUrl && supabaseServiceRoleKey)) {
    return null;
  }

  const client = createClient(supabaseUrl, supabaseServiceRoleKey);
  const cache = new Map<string, FileStorageService>();

  return (bucket: string): FileStorageService => {
    let service = cache.get(bucket);
    if (!service) {
      const provider = createSupabaseFileStorageProvider({ client, bucket });
      service = createFileStorageService({ provider });
      cache.set(bucket, service);
    }
    return service;
  };
}

export function registerFileStorageRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
}) {
  const { app, config } = params;

  let _factory: ReturnType<typeof createFileStorageServiceFactory> | undefined;
  const getFactory = () => {
    if (_factory === undefined) {
      _factory = createFileStorageServiceFactory(config);
    }
    return _factory;
  };

  function resolveFileStorage(bucketParam: string | undefined) {
    const factory = getFactory();
    if (!factory) {
      return null;
    }
    const bucket = bucketParam || DEFAULT_BUCKET;
    return { service: factory(bucket), bucket };
  }

  /**
   * Resolve a tenant-scoped, browsable bucket for the file explorer. Rejects
   * unknown buckets and missing tenant context so listing/url/delete can never
   * reach another tenant's content.
   */
  function resolveTenantBucket(
    c: Context,
    tenantId: string | null
  ):
    | { bucket: TenantBucket; bucketId: string; service: FileStorageService }
    | { error: Response } {
    const factory = getFactory();
    if (!factory) {
      return {
        error: jsonApiError(c, 503, {
          message:
            "File storage service not available (Supabase not configured)",
        }),
      };
    }
    const requested = c.req.query("bucket");
    const bucket = findTenantBucket(requested);
    if (!bucket) {
      return {
        error: jsonApiError(c, 404, {
          message: `Bucket '${requested ?? DEFAULT_BUCKET}' is not browsable`,
        }),
      };
    }
    if (!tenantId) {
      return {
        error: jsonApiError(c, 403, { message: "tenant_id_required" }),
      };
    }
    return { bucket, bucketId: bucket.id, service: factory(bucket.id) };
  }

  // ── GET /api/file-storage/buckets — list known buckets ──
  app.get("/api/file-storage/buckets", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    return jsonApiSuccess(
      c,
      FILE_EXPLORER_BUCKETS.map((b) => ({
        id: b.id,
        default: Boolean(b.default),
      }))
    );
  });

  // ── GET /api/file-storage/files — list files ──
  app.get("/api/file-storage/files", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const tenantId = authResult.auth.tenantId;
    const resolved = resolveTenantBucket(c, tenantId);
    if ("error" in resolved) {
      return resolved.error;
    }
    const { bucket, service } = resolved;

    const limit = Number.parseInt(c.req.query("limit") || "200", 10);
    const search = c.req.query("search") || undefined;
    const mode = c.req.query("mode");

    let basePrefix: string;
    try {
      basePrefix = resolveTenantPrefix(
        bucket,
        tenantId as string,
        c.req.query("prefix")
      );
    } catch (err) {
      if (err instanceof TenantScopeViolationError) {
        return jsonApiError(c, 403, { message: err.message });
      }
      throw err;
    }

    const isFile = (filename: string, size: number): boolean =>
      /\.[a-zA-Z0-9]{1,10}$/.test(filename) || size > 0;

    /** Add a tenant-relative `rel_key` so the UI can hide the tenant root. */
    const withRelKey = <T extends { key: string }>(file: T): T => {
      (file as T & { rel_key?: string }).rel_key = relativeToTenantRoot(
        bucket,
        tenantId as string,
        file.key
      );
      return file;
    };

    /** Recursively collect files under a prefix (used for global search). */
    const walkFiles = async () => {
      const allFiles: Awaited<ReturnType<typeof service.list>>["files"] = [];
      const dirsToVisit = [basePrefix];
      const maxDepth = 10;
      let depth = 0;
      while (dirsToVisit.length > 0 && depth < maxDepth) {
        depth++;
        const nextDirs: string[] = [];
        for (const dir of dirsToVisit) {
          const result = await service.list(dir, {
            limit: 1000,
            offset: 0,
            search,
          });
          for (const file of result.files) {
            if (isFileStorageListingHiddenKey(file.key)) {
              continue;
            }
            if (isFile(file.filename, file.size_bytes)) {
              if (!file.module) {
                const mod = moduleFolderFromFileStorageKey(file.key);
                if (mod) {
                  file.module = mod;
                }
              }
              enrichFileStorageFileForApi(file);
              withRelKey(file);
              allFiles.push(file);
            } else {
              nextDirs.push(file.key);
            }
          }
        }
        dirsToVisit.length = 0;
        dirsToVisit.push(...nextDirs);
      }
      return allFiles;
    };

    try {
      // Folder-aware single-level listing for the explorer.
      if (mode === "children" && !search) {
        const result = service.listChildren
          ? await service.listChildren(basePrefix, { limit: 1000 })
          : { folders: [], files: (await service.list(basePrefix)).files };
        const folders = result.folders
          .map((d) => ({
            name: d.name,
            prefix: relativeToTenantRoot(bucket, tenantId as string, d.prefix),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const files: typeof result.files = [];
        for (const entry of result.files) {
          if (isFileStorageListingHiddenKey(entry.key)) {
            continue;
          }
          enrichFileStorageFileForApi(entry);
          withRelKey(entry);
          files.push(entry);
        }
        return jsonApiSuccess(
          c,
          { folders, files },
          { meta: { total: folders.length + files.length, bucket: bucket.id } }
        );
      }

      // Flat (recursive) listing — used for search and back-compat callers.
      const allFiles = await walkFiles();
      const paged = allFiles.slice(0, limit);
      return jsonApiSuccess(c, paged, {
        meta: {
          total: allFiles.length,
          page: 1,
          pageSize: limit,
          bucket: bucket.id,
        },
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("File storage list failed", { error: error.message });
      return jsonApiError(c, 500, { message: error.message });
    }
  });

  // ── GET /api/file-storage/files/url — get signed URL for a file ──
  app.get("/api/file-storage/files/url", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const tenantId = authResult.auth.tenantId;
    const resolved = resolveTenantBucket(c, tenantId);
    if ("error" in resolved) {
      return resolved.error;
    }

    const key = c.req.query("key");
    if (!key) {
      return jsonApiError(c, 400, { message: "Missing 'key' query parameter" });
    }
    try {
      assertKeyInTenant(resolved.bucket, tenantId as string, key);
    } catch (err) {
      if (err instanceof TenantScopeViolationError) {
        return jsonApiError(c, 403, { message: err.message });
      }
      throw err;
    }

    try {
      const url = await resolved.service.getUrl(key, {
        signed: true,
        expiresIn: 3600,
      });
      return jsonApiSuccess(c, { url, key, bucket: resolved.bucketId });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("File storage getUrl failed", { error: error.message, key });
      return jsonApiError(c, 404, { message: error.message });
    }
  });

  // ── POST /api/file-storage/files/signed-upload-url — browser-direct upload contract ──
  app.post("/api/file-storage/files/signed-upload-url", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const resolved = resolveFileStorage(c.req.query("bucket"));
    if (!resolved) {
      return jsonApiError(c, 503, {
        message: "File storage service not available",
      });
    }

    if (!resolved.service.signedUploadUrl) {
      return jsonApiError(c, 501, {
        message:
          "Signed upload URLs are not supported for this storage provider",
      });
    }

    let body: {
      key?: string;
      content_type?: string;
      expires_in?: number;
      max_size?: number;
    };
    try {
      body = await c.req.json();
    } catch {
      return jsonApiError(c, 400, { message: "Invalid JSON body" });
    }

    const key = body.key?.trim();
    if (!key) {
      return jsonApiError(c, 400, { message: "Missing 'key'" });
    }

    const contentType = body.content_type?.trim();
    if (!contentType) {
      return jsonApiError(c, 400, { message: "Missing 'content_type'" });
    }

    if (body.max_size !== undefined) {
      return jsonApiError(c, 400, {
        message:
          "max_size is not supported for Supabase signed upload URLs; enforce limits before issuing the URL",
      });
    }

    try {
      assertTenantScopedStorageKey(key, authResult.auth.tenantId);
    } catch (error) {
      if (error instanceof FileStorageTenantScopeError) {
        return jsonApiError(c, 403, { message: error.message });
      }
      throw error;
    }

    try {
      const signed = await resolved.service.signedUploadUrl(key, {
        contentType,
        expiresIn: body.expires_in,
      });
      return jsonApiSuccess(c, {
        bucket: resolved.bucket,
        headers: signed.headers ?? {},
        key: signed.key,
        url: signed.url,
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("File storage signed upload URL failed", {
        error: error.message,
        key,
      });
      return jsonApiError(c, 500, { message: error.message });
    }
  });

  // ── GET/HEAD /api/file-storage/files/bytes — key-addressed download for server clients ──
  app.on(["GET", "HEAD"], "/api/file-storage/files/bytes", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const resolved = resolveFileStorage(c.req.query("bucket"));
    if (!resolved) {
      return jsonApiError(c, 503, {
        message: "File storage service not available",
      });
    }

    const key = c.req.query("key");
    if (!key) {
      return jsonApiError(c, 400, { message: "Missing 'key' query parameter" });
    }

    try {
      const bytes = await resolved.service.download(key);
      if (bytes === null) {
        return c.body(null, 404);
      }
      const filename = key.split("/").pop() ?? key;
      const contentType = guessFileStorageMimeFromFilename(filename);
      if (c.req.method === "HEAD") {
        c.header("Content-Type", contentType);
        c.header("Content-Length", String(bytes.byteLength));
        return c.body(null, 200);
      }
      return c.body(bytes, 200, {
        "Content-Type": contentType,
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("File storage bytes download failed", {
        error: error.message,
        key,
      });
      return jsonApiError(c, 404, { message: error.message });
    }
  });

  // ── PUT /api/file-storage/files/bytes — key-addressed upload for server clients ──
  app.put("/api/file-storage/files/bytes", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const resolved = resolveFileStorage(c.req.query("bucket"));
    if (!resolved) {
      return jsonApiError(c, 503, {
        message: "File storage service not available",
      });
    }

    const key = c.req.query("key");
    if (!key) {
      return jsonApiError(c, 400, { message: "Missing 'key' query parameter" });
    }

    const upsert =
      c.req.query("upsert") !== "false" && c.req.query("upsert") !== "0";
    const module = c.req.query("module") || undefined;
    const contentType =
      c.req.query("contentType") ||
      c.req.header("content-type") ||
      guessFileStorageMimeFromFilename(key.split("/").pop() ?? key);

    try {
      if (!upsert) {
        const exists = await resolved.service.exists(key);
        if (exists) {
          return jsonApiError(c, 409, { message: "File already exists" });
        }
      }

      const body = await c.req.arrayBuffer();
      await resolved.service.upload(key, new Uint8Array(body), {
        contentType,
        module,
        upsert,
      });

      logger.info("File storage bytes uploaded", {
        bucket: resolved.bucket,
        key,
        size: body.byteLength,
      });

      return jsonApiSuccess(c, {
        key,
        size_bytes: body.byteLength,
        mime_type: contentType,
        bucket: resolved.bucket,
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("File storage bytes upload failed", {
        error: error.message,
        key,
      });
      return jsonApiError(c, 500, { message: error.message });
    }
  });

  // ── GET /api/file-storage/files/preview-pdf — Office → PDF via Gotenberg (cached sidecar) ──
  app.get("/api/file-storage/files/preview-pdf", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    if (!isGotenbergConfigured()) {
      return jsonApiError(c, 503, {
        message: "PDF preview service not configured (GOTENBERG_URL)",
      });
    }

    const resolved = resolveFileStorage(c.req.query("bucket"));
    if (!resolved) {
      return jsonApiError(c, 503, {
        message: "File storage service not available",
      });
    }

    const key = c.req.query("key");
    if (
      !key ||
      isFileStorageExtractSidecarKey(key) ||
      isFileStoragePreviewPdfSidecarKey(key) ||
      isFileStorageThumbWebpSidecarKey(key)
    ) {
      return jsonApiError(c, 400, { message: "Missing or invalid 'key'" });
    }

    const filename = key.split("/").pop() ?? key;
    const mimeType = guessFileStorageMimeFromFilename(filename);
    if (!isFileStorageOfficePdfPreviewMime(mimeType)) {
      return jsonApiError(c, 400, {
        message: `Preview not supported for type: ${mimeType}`,
      });
    }

    const force =
      c.req.query("force") === "1" || c.req.query("force") === "true";
    const sidecarKey = fileStoragePreviewPdfSidecarKey(key);

    if (!force) {
      try {
        const existing = await resolved.service.download(sidecarKey);
        if (existing && existing.byteLength > 0) {
          const url = await resolved.service.getUrl(sidecarKey, {
            signed: true,
            expiresIn: 3600,
          });
          return jsonApiSuccess(c, {
            url,
            key,
            sidecar_key: sidecarKey,
            bucket: resolved.bucket,
            cached: true,
          });
        }
      } catch {
        /* no sidecar yet */
      }
    }

    const built = await loadOrCreateOfficePreviewPdf(
      resolved.service,
      key,
      filename,
      force
    );
    if (!built.ok) {
      return jsonApiError(c, built.status, { message: built.message });
    }

    try {
      const url = await resolved.service.getUrl(sidecarKey, {
        signed: true,
        expiresIn: 3600,
      });
      return jsonApiSuccess(c, {
        url,
        key,
        sidecar_key: sidecarKey,
        bucket: resolved.bucket,
        cached: false,
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return jsonApiError(c, 500, { message: error.message });
    }
  });

  // ── GET /api/file-storage/files/thumbnail — WebP list thumbnail (first PDF page, cached sidecar) ──
  app.get("/api/file-storage/files/thumbnail", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const resolved = resolveFileStorage(c.req.query("bucket"));
    if (!resolved) {
      return jsonApiError(c, 503, {
        message: "File storage service not available",
      });
    }

    const key = c.req.query("key");
    if (
      !key ||
      isFileStorageExtractSidecarKey(key) ||
      isFileStoragePreviewPdfSidecarKey(key) ||
      isFileStorageThumbWebpSidecarKey(key)
    ) {
      return jsonApiError(c, 400, { message: "Missing or invalid 'key'" });
    }

    const filename = key.split("/").pop() ?? key;
    const mimeType = guessFileStorageMimeFromFilename(filename);
    if (!isFileStorageThumbnailSourceMime(mimeType)) {
      return jsonApiError(c, 400, {
        message: `Thumbnail not supported for type: ${mimeType}`,
      });
    }

    const force =
      c.req.query("force") === "1" || c.req.query("force") === "true";
    const thumbKey = fileStorageThumbWebpSidecarKey(key);

    if (!force) {
      try {
        const existing = await resolved.service.download(thumbKey);
        if (existing && existing.byteLength > 0) {
          const url = await resolved.service.getUrl(thumbKey, {
            signed: true,
            expiresIn: 3600,
          });
          return jsonApiSuccess(c, {
            url,
            key,
            sidecar_key: thumbKey,
            bucket: resolved.bucket,
            cached: true,
          });
        }
      } catch {
        /* no thumb yet */
      }
    }

    let pdfBytes: Uint8Array | null = null;
    if (mimeType === "application/pdf") {
      const raw = await resolved.service.download(key);
      if (!raw || raw.byteLength === 0) {
        return jsonApiError(c, 404, { message: "File not found" });
      }
      pdfBytes = raw;
    } else {
      const built = await loadOrCreateOfficePreviewPdf(
        resolved.service,
        key,
        filename,
        false
      );
      if (!built.ok) {
        return jsonApiError(c, built.status, { message: built.message });
      }
      pdfBytes = built.pdf;
    }

    let webp: Uint8Array;
    try {
      webp = await renderPdfFirstPageWebp(pdfBytes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("File storage thumbnail rasterize failed", {
        key,
        error: msg,
      });
      return jsonApiError(c, 502, { message: msg });
    }

    try {
      await resolved.service.upload(thumbKey, webp, {
        contentType: "image/webp",
        upsert: true,
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("File storage thumbnail upload failed", {
        key: thumbKey,
        error: error.message,
      });
      return jsonApiError(c, 500, { message: error.message });
    }

    try {
      const url = await resolved.service.getUrl(thumbKey, {
        signed: true,
        expiresIn: 3600,
      });
      return jsonApiSuccess(c, {
        url,
        key,
        sidecar_key: thumbKey,
        bucket: resolved.bucket,
        cached: false,
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return jsonApiError(c, 500, { message: error.message });
    }
  });

  // ── DELETE /api/file-storage/files — delete file ──
  app.delete("/api/file-storage/files", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const tenantId = authResult.auth.tenantId;
    const resolved = resolveTenantBucket(c, tenantId);
    if ("error" in resolved) {
      return resolved.error;
    }

    const key = c.req.query("key");
    if (!key) {
      return jsonApiError(c, 400, { message: "Missing 'key' query parameter" });
    }
    try {
      assertKeyInTenant(resolved.bucket, tenantId as string, key);
    } catch (err) {
      if (err instanceof TenantScopeViolationError) {
        return jsonApiError(c, 403, { message: err.message });
      }
      throw err;
    }

    try {
      await resolved.service.delete(key);
      const sidecar = fileStorageExtractSidecarKey(key);
      try {
        await resolved.service.delete(sidecar);
      } catch {
        /* ignore missing sidecar */
      }
      const previewSidecar = fileStoragePreviewPdfSidecarKey(key);
      try {
        await resolved.service.delete(previewSidecar);
      } catch {
        /* ignore missing preview sidecar */
      }
      const thumbSidecar = fileStorageThumbWebpSidecarKey(key);
      try {
        await resolved.service.delete(thumbSidecar);
      } catch {
        /* ignore missing thumbnail sidecar */
      }
      logger.info("File storage file deleted", {
        key,
        bucket: resolved.bucketId,
      });
      return jsonApiSuccess(c, null);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("File storage delete failed", { error: error.message, key });
      return jsonApiError(c, 500, { message: error.message });
    }
  });

  // ── GET /api/file-storage/files/extract — stored markdown/json sidecar ──
  app.get("/api/file-storage/files/extract", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    const resolved = resolveFileStorage(c.req.query("bucket"));
    if (!resolved) {
      return jsonApiError(c, 503, {
        message: "File storage service not available",
      });
    }

    const key = c.req.query("key");
    if (
      !key ||
      isFileStorageExtractSidecarKey(key) ||
      isFileStoragePreviewPdfSidecarKey(key) ||
      isFileStorageThumbWebpSidecarKey(key)
    ) {
      return jsonApiError(c, 400, { message: "Missing or invalid 'key'" });
    }

    const sidecarKey = fileStorageExtractSidecarKey(key);
    try {
      const raw = await resolved.service.download(sidecarKey);
      if (!raw || raw.byteLength === 0) {
        return jsonApiError(c, 404, { message: "No extracted content yet" });
      }
      const text = new TextDecoder().decode(raw);
      const data = JSON.parse(text) as Record<string, unknown>;
      return jsonApiSuccess(c, data);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (error.message.includes("JSON")) {
        return jsonApiError(c, 500, { message: "Invalid extract payload" });
      }
      return jsonApiError(c, 404, { message: "No extracted content yet" });
    }
  });

  // ── GET /api/file-storage/doc-converter/availability — cloud backend readiness ──
  // Replaces the retired GET /api/ai/doc-converter/availability (core AI runtime
  // split 2026-05-21). Reflects platform-hydrated env keys (LLAMA_CLOUD_API_KEY,
  // MISTRAL_API_KEY, AI_GATEWAY_API_KEY) so the AI settings doc-converter card
  // shows real state instead of the 404 stub that always read "not configured".
  app.get("/api/file-storage/doc-converter/availability", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { getDocConverterCloudAvailability } = await import(
      "@engenty/doc-converter"
    );
    return c.json(getDocConverterCloudAvailability());
  });

  // ── POST /api/file-storage/files/extract — run doc converter and store sidecar ──
  app.post("/api/file-storage/files/extract", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }

    let body: { key?: string; bucket?: string };
    try {
      body = (await c.req.json()) as { key?: string; bucket?: string };
    } catch {
      return jsonApiError(c, 400, { message: "Invalid JSON body" });
    }

    const resolved = resolveFileStorage(
      typeof body.bucket === "string" ? body.bucket : undefined
    );
    if (!resolved) {
      return jsonApiError(c, 503, {
        message: "File storage service not available",
      });
    }

    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (
      !key ||
      isFileStorageExtractSidecarKey(key) ||
      isFileStoragePreviewPdfSidecarKey(key) ||
      isFileStorageThumbWebpSidecarKey(key)
    ) {
      return jsonApiError(c, 400, { message: "Missing or invalid 'key'" });
    }

    const bytes = await resolved.service.download(key);
    if (!bytes || bytes.byteLength === 0) {
      return jsonApiError(c, 404, { message: "File not found" });
    }

    const filename = key.split("/").pop() ?? key;
    const mimeType = guessFileStorageMimeFromFilename(filename);

    const converterConfig = await resolveDocConverterConfig(
      config,
      authResult.auth.tenantId
    );
    const { Converter } = await import("@engenty/doc-converter");
    const converter = new Converter(converterConfig);

    if (!converter.canConvert(mimeType)) {
      return jsonApiError(c, 400, {
        message: `Cannot extract text for type: ${mimeType}`,
      });
    }

    let conv: import("@engenty/doc-converter").ConversionResult;
    try {
      conv = await converter.convert(bytes, filename, mimeType);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("File storage extract conversion failed", {
        key,
        error: msg,
      });
      return jsonApiError(c, 500, { message: msg });
    }

    const payload = {
      markdown: conv.markdown,
      extracted_at: new Date().toISOString(),
      source_mime: mimeType,
      metadata: conv.metadata,
    };

    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    const sidecarKey = fileStorageExtractSidecarKey(key);
    try {
      await resolved.service.upload(sidecarKey, encoded, {
        contentType: "application/json",
        upsert: true,
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("File storage extract upload failed", {
        key: sidecarKey,
        error,
      });
      return jsonApiError(c, 500, { message: error.message });
    }

    return jsonApiSuccess(c, payload);
  });
}
