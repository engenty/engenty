import { createHash } from "node:crypto";
import type {
  DocumentSourceMedia,
  DocumentSourceRetrievedItem,
} from "@engenty/document-sources";
import { fileStorageTenantObjectKey } from "@engenty/file-storage";
import type { StorageService } from "@engenty/plugin-sdk";
import { isBlockedHostname } from "@engenty/web-ingest";
import { MDocument } from "@mastra/rag";
import type { KbRepoFactory } from "../dal/contracts.js";
import type {
  KbSource,
  KbSourceItem,
  KbSourceItemMediaInput,
} from "../schema/types.js";

type MediaCaptureMode =
  | "none"
  | "catalog"
  | "download_images"
  | "download_safe_assets";

function readMediaCaptureSettings(settings: Record<string, unknown>): {
  allowedMimePrefixes: string[];
  maxBytes: number;
  mode: MediaCaptureMode;
} {
  const rawMode = settings.media_capture_mode;
  const mode: MediaCaptureMode =
    rawMode === "none" ||
    rawMode === "download_images" ||
    rawMode === "download_safe_assets" ||
    rawMode === "catalog"
      ? rawMode
      : "catalog";
  const rawPrefixes = settings.media_allowed_mime_prefixes;
  const allowedMimePrefixes = (
    Array.isArray(rawPrefixes)
      ? rawPrefixes
      : typeof rawPrefixes === "string"
        ? rawPrefixes.split(",")
        : ["image/"]
  )
    .filter((part): part is string => typeof part === "string")
    .map((part) => part.trim())
    .filter(Boolean);
  const maxMb =
    typeof settings.media_max_file_size_mb === "number"
      ? settings.media_max_file_size_mb
      : typeof settings.media_max_file_size_mb === "string"
        ? Number.parseFloat(settings.media_max_file_size_mb)
        : 10;
  return {
    allowedMimePrefixes:
      allowedMimePrefixes.length > 0 ? allowedMimePrefixes : ["image/"],
    maxBytes: Math.max(1, Math.min(maxMb || 10, 50)) * 1024 * 1024,
    mode,
  };
}

function shouldDownloadMedia(
  mode: MediaCaptureMode,
  media: DocumentSourceMedia
): boolean {
  if (mode === "download_images") {
    return media.media_type === "image";
  }
  if (mode === "download_safe_assets") {
    return media.media_type === "image" || media.media_type === "document";
  }
  return false;
}

function safeFilenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const filename = path.split("/").filter(Boolean).pop() ?? "media";
    return filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "media";
  } catch {
    return "media";
  }
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function downloadMediaToFileStorage(args: {
  itemId: string;
  media: DocumentSourceMedia;
  settings: ReturnType<typeof readMediaCaptureSettings>;
  source: KbSource;
  storageService: StorageService | null | undefined;
}): Promise<
  Pick<
    KbSourceItemMediaInput,
    | "content_hash"
    | "content_type"
    | "download_status"
    | "size_bytes"
    | "storage_object_key"
  >
> {
  const { itemId, media, settings, source, storageService } = args;
  if (
    !(storageService && shouldDownloadMedia(settings.mode, media)) ||
    media.source_url.startsWith("data:")
  ) {
    return {
      content_hash: null,
      content_type: media.content_type ?? null,
      download_status: settings.mode === "catalog" ? "external" : "skipped",
      size_bytes: null,
      storage_object_key: null,
    };
  }
  try {
    const parsed = new URL(media.source_url);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      isBlockedHostname(parsed.hostname)
    ) {
      return {
        content_hash: null,
        content_type: media.content_type ?? null,
        download_status: "skipped",
        size_bytes: null,
        storage_object_key: null,
      };
    }
    const response = await fetch(media.source_url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ||
      media.content_type ||
      "application/octet-stream";
    if (
      !settings.allowedMimePrefixes.some((prefix) =>
        contentType.startsWith(prefix)
      )
    ) {
      return {
        content_hash: null,
        content_type: contentType,
        download_status: "skipped",
        size_bytes: null,
        storage_object_key: null,
      };
    }
    const contentLength = Number.parseInt(
      response.headers.get("content-length") ?? "",
      10
    );
    if (Number.isFinite(contentLength) && contentLength > settings.maxBytes) {
      return {
        content_hash: null,
        content_type: contentType,
        download_status: "skipped",
        size_bytes: contentLength,
        storage_object_key: null,
      };
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > settings.maxBytes) {
      return {
        content_hash: null,
        content_type: contentType,
        download_status: "skipped",
        size_bytes: buffer.byteLength,
        storage_object_key: null,
      };
    }
    const hash = sha256Bytes(buffer);
    const key = fileStorageTenantObjectKey(
      source.tenant_id,
      "knowledge-base",
      "sources",
      source.id,
      "items",
      itemId,
      "media",
      `${hash.slice(0, 16)}-${safeFilenameFromUrl(media.source_url)}`
    );
    await storageService.upload(key, buffer, {
      contentType,
      upsert: true,
    });
    return {
      content_hash: hash,
      content_type: contentType,
      download_status: "downloaded",
      size_bytes: buffer.byteLength,
      storage_object_key: key,
    };
  } catch {
    return {
      content_hash: null,
      content_type: media.content_type ?? null,
      download_status: "failed",
      size_bytes: null,
      storage_object_key: null,
    };
  }
}

export async function persistRetrievedStructure(args: {
  item: KbSourceItem;
  repos: KbRepoFactory;
  retrieved: DocumentSourceRetrievedItem;
  source: KbSource;
  storageService?: StorageService | null;
}): Promise<{ linkCount: number; mediaCount: number; sectionCount: number }> {
  const { item, repos, retrieved, source, storageService } = args;
  const mediaSettings = readMediaCaptureSettings(source.settings);
  let retrievedSections = retrieved.sections;
  if (
    (!retrievedSections || retrievedSections.length === 0) &&
    (retrieved.markdown || retrieved.text)
  ) {
    const textToChunk = retrieved.markdown || retrieved.text || "";
    const doc = MDocument.fromMarkdown(textToChunk);
    const chunks = await doc.chunk({
      strategy: "recursive",
      maxSize: 1000,
      overlap: 100,
    });
    retrievedSections = chunks.map((chunk, index) => ({
      content: chunk.text,
      kind: "text",
      locator: null,
      metadata: {},
      position: index,
      title: `Section ${index + 1}`,
    }));
  }

  const sections = (retrievedSections ?? []).map((section, index) => ({
    content: section.content,
    kind: section.kind,
    locator: section.locator ?? null,
    metadata: section.metadata ?? {},
    position: section.position ?? index,
    title: section.title ?? null,
  }));
  const links = (retrieved.links ?? []).map((link, index) => ({
    href: link.href,
    link_type: link.link_type,
    metadata: link.metadata ?? {},
    normalized_href: link.normalized_href,
    position: link.position ?? index,
    rel: link.rel ?? null,
    text: link.text ?? null,
    title: link.title ?? null,
  }));
  const mediaInputs: KbSourceItemMediaInput[] = [];
  if (mediaSettings.mode !== "none") {
    for (const [index, media] of (retrieved.media ?? []).entries()) {
      const download = await downloadMediaToFileStorage({
        itemId: item.id,
        media,
        settings: mediaSettings,
        source,
        storageService,
      });
      mediaInputs.push({
        alt_text: media.alt_text ?? null,
        content_hash: download.content_hash,
        content_type: download.content_type ?? media.content_type ?? null,
        description: media.description ?? null,
        download_status: download.download_status,
        height: media.height ?? null,
        media_type: media.media_type,
        metadata: media.metadata ?? {},
        position: media.position ?? index,
        size_bytes: download.size_bytes,
        source_url: media.source_url,
        title: media.title ?? null,
        storage_object_key: download.storage_object_key,
        width: media.width ?? null,
      });
    }
  }

  await repos.sources.replaceSourceItemSections(item.id, sections);
  await repos.sources.replaceSourceItemLinks(item.id, links);
  await repos.sources.replaceSourceItemMedia(item.id, mediaInputs);

  return {
    linkCount: links.length,
    mediaCount: mediaInputs.length,
    sectionCount: sections.length,
  };
}
