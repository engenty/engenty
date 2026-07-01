import { parseTenantAiSettings, TENANT_AI_CONFIG_KEY } from "@engenty/ai-core";
import {
  fileStorageTenantObjectKey,
  guessFileStorageMimeFromFilename,
} from "@engenty/file-storage";
import { createLogger } from "@engenty/telemetry";
import { createTenantSettingsRepoSupabase } from "@engenty/tenant-settings";
import type { GetKbRepo, KbServerApi } from "./kb-api-shared.js";
import { badRequest } from "./kb-api-shared.js";

const logger = createLogger({ name: "kb-api" });

export function registerKbDocumentConversionRoutes(
  api: KbServerApi,
  getRepo: GetKbRepo
) {
  /* ── Document Conversion ── */

  api.registerHttpRoute({
    method: "post",
    path: "/api/kb/convert-document",
    handler: async (ctx) => {
      const repos = getRepo(ctx.auth);

      try {
        const request = ctx.request as Request | undefined;
        if (!request) {
          return badRequest("No request object available");
        }

        const formData = await request.formData();
        const file = formData.get("file");
        const kbIdRaw = formData.get("kb_id");
        const kbId = typeof kbIdRaw === "string" ? kbIdRaw.trim() : "";

        if (!(file && file instanceof File)) {
          return badRequest(
            "No file provided — expected multipart form with 'file' field"
          );
        }

        const buffer = new Uint8Array(await file.arrayBuffer());
        const rawMime = file.type?.trim() ?? "";
        const inferred = guessFileStorageMimeFromFilename(file.name);
        const mimeType =
          !rawMime ||
          rawMime === "application/octet-stream" ||
          rawMime === "application/x-download"
            ? inferred
            : rawMime;

        // Convert to markdown (best-effort: empty markdown is OK if mime
        // is unsupported — we still want to keep the original in vault).
        let markdown = "";
        let metadata: Record<string, unknown> = {};
        try {
          const { Converter } = await import("@engenty/doc-converter");
          let converterConfig:
            | import("@engenty/doc-converter").ConverterConfig
            | undefined;
          const auth = ctx.auth;
          const databaseAdapter = api.getDatabaseAdapter?.();
          if (auth && databaseAdapter) {
            try {
              const repo = createTenantSettingsRepoSupabase(
                databaseAdapter,
                auth.tenantId,
                auth.scopeId
              );
              const row = await repo.get(TENANT_AI_CONFIG_KEY);
              const tenantAi = parseTenantAiSettings(row?.value);
              const dc = tenantAi.doc_converter;
              const p = dc?.provider ?? "local";
              converterConfig = {
                provider:
                  p === "llamaparse" ||
                  p === "gemini" ||
                  p === "liteparse" ||
                  p === "local"
                    ? p
                    : "local",
                gemini_model: dc?.gemini_model ?? undefined,
              };
            } catch (cfgErr) {
              logger.warn("Could not load tenant AI config for doc converter", {
                error:
                  cfgErr instanceof Error ? cfgErr.message : String(cfgErr),
              });
            }
          }
          const converter = new Converter(converterConfig);
          if (converter.canConvert(mimeType)) {
            const conv = await converter.convert(buffer, file.name, mimeType);
            markdown = conv.markdown;
            metadata = conv.metadata;
          } else {
            logger.warn("No converter for mime type — storing original only", {
              filename: file.name,
              mimeType,
            });
          }
        } catch (convErr) {
          // Conversion failed (e.g. corrupt DOCX). Don't lose the upload —
          // store the original in vault and let the user fill content manually.
          logger.warn("Conversion failed — storing original only", {
            filename: file.name,
            mimeType,
            error: convErr instanceof Error ? convErr.message : String(convErr),
          });
        }

        // Persist under tenants/<tenant-id>/knowledge-base/<kbSlug>/... (vault bucket)
        let originalStoragePath: string | null = null;
        if (kbId) {
          const kb = await repos.kb.getById(kbId);
          if (!kb) {
            return badRequest(`Unknown kb_id: ${kbId}`);
          }
          const storage = api.getStorageService?.("files");
          if (storage) {
            const tenantId = ctx.auth?.tenantId ?? "unknown";
            const kbSlug = kb.slug || kb.id;
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            originalStoragePath = fileStorageTenantObjectKey(
              tenantId,
              "knowledge-base",
              kbSlug,
              `${Date.now()}_${safeName}`
            );
            try {
              await storage.upload(originalStoragePath, buffer, {
                contentType: mimeType,
                upsert: false,
              });
            } catch (storeErr) {
              logger.error("Vault upload failed", {
                key: originalStoragePath,
                error:
                  storeErr instanceof Error
                    ? storeErr.message
                    : String(storeErr),
              });
              originalStoragePath = null;
            }
          } else {
            logger.warn("Vault storage service unavailable; skipping persist");
          }
        }

        logger.info("Document converted", {
          filename: file.name,
          markdown_length: markdown.length,
          stored: !!originalStoragePath,
        });

        const createInboxRaw = formData.get("create_inbox_item");
        const createInboxItem =
          createInboxRaw === "true" ||
          createInboxRaw === "1" ||
          createInboxRaw === "on";
        const inboxTitleRaw = formData.get("inbox_title");
        const inboxTitle =
          typeof inboxTitleRaw === "string" && inboxTitleRaw.trim().length > 0
            ? inboxTitleRaw.trim()
            : file.name;

        if (createInboxItem && !kbId) {
          return badRequest("kb_id required when create_inbox_item is true");
        }

        const response: Record<string, unknown> = {
          markdown,
          metadata,
          source: {
            filename: file.name,
            mime_type: mimeType,
            size_bytes: buffer.byteLength,
          },
          original: originalStoragePath
            ? {
                filename: file.name,
                mime_type: mimeType,
                size_bytes: buffer.byteLength,
                storage_path: originalStoragePath,
              }
            : null,
        };

        if (createInboxItem && kbId) {
          try {
            const inboxItem = await repos.inbox.create(
              {
                kb_id: kbId,
                title: inboxTitle,
                source_type: "file",
                source_url: null,
                raw_markdown: markdown.length > 0 ? markdown : null,
                raw_text: null,
                metadata: { ...metadata, source_filename: file.name },
                original_storage_path: originalStoragePath,
              },
              ctx.auth?.principalId ?? null
            );
            await repos.activity_log.append({
              kb_id: kbId,
              event_type: "inbox.capture",
              payload: {
                inbox_id: inboxItem.id,
                source_type: "file",
                via: "convert-document",
              },
              actor_id: ctx.auth?.principalId ?? null,
            });
            response.inbox_item = inboxItem;
          } catch (inboxErr) {
            logger.warn("Inbox item creation after convert failed", {
              error:
                inboxErr instanceof Error ? inboxErr.message : String(inboxErr),
            });
          }
        }

        return response;
      } catch (err) {
        logger.error("Document conversion failed", { error: err });
        return new Response(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : "Conversion failed",
          }),
          { status: 500, headers: { "content-type": "application/json" } }
        );
      }
    },
  });
}
