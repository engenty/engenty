/**
 * Overlay human names onto the admin files explorer listing.
 *
 * Keys stay UUIDs. Spaces come from `core.spaces`; native file-space blobs
 * from `module_files.file_entries`. Failures are swallowed so a missing row
 * still lists as the UUID rather than 500ing the bucket browser.
 */
import {
  collectFileStorageExplorerIds,
  fileStorageExplorerPathLabel,
  overlayExplorerFolderName,
} from "@engenty/file-storage";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listSpacesByIds } from "../../dal/spaces.js";

const logger = createLogger({ name: "file-storage.explorer-labels" });

export interface ExplorerFileOverlay {
  filename: string;
  mimeType: string;
}

export interface ExplorerLabelMaps {
  files: Record<string, ExplorerFileOverlay>;
  /** uuid → display name (spaces and, for breadcrumbs, file entry ids). */
  segments: Record<string, string>;
  /** uuid → tooltip (space name + slug). */
  titles: Record<string, string>;
}

export async function loadExplorerLabelMaps(
  client: SupabaseClient,
  tenantId: string,
  paths: { keys?: readonly string[]; prefixes?: readonly string[] }
): Promise<ExplorerLabelMaps> {
  const { fileKeys, spaceIds } = collectFileStorageExplorerIds(paths);
  const maps: ExplorerLabelMaps = { files: {}, segments: {}, titles: {} };
  if (spaceIds.length === 0 && fileKeys.length === 0) {
    return maps;
  }
  try {
    if (spaceIds.length > 0) {
      const spaces = await listSpacesByIds(client, tenantId, spaceIds);
      for (const space of spaces) {
        const name = space.name.trim() || space.key || space.id;
        maps.segments[space.id] = name;
        maps.titles[space.id] = `${name} (${space.key})`;
      }
    }
    if (fileKeys.length > 0) {
      const { data, error } = await client
        .schema("module_files")
        .from("file_entries")
        .select("storage_key, filename, mime_type")
        .eq("tenant_id", tenantId)
        .in("storage_key", fileKeys);
      if (error) {
        throw error;
      }
      for (const row of data ?? []) {
        const key = typeof row.storage_key === "string" ? row.storage_key : "";
        const filename =
          typeof row.filename === "string" ? row.filename.trim() : "";
        if (!(key && filename)) {
          continue;
        }
        const mimeType =
          typeof row.mime_type === "string" && row.mime_type.trim()
            ? row.mime_type
            : "application/octet-stream";
        maps.files[key] = { filename, mimeType };
        const leaf = key.split("/").pop();
        if (leaf) {
          maps.segments[leaf] = filename;
        }
      }
    }
  } catch (error) {
    logger.warn("explorer_label_lookup_failed", {
      error: error instanceof Error ? error.message : String(error),
      file_keys: fileKeys.length,
      space_ids: spaceIds.length,
    });
  }
  return maps;
}

export function applyExplorerFileOverlay<
  T extends { filename: string; key: string; mime_type: string },
>(file: T, maps: ExplorerLabelMaps): T {
  const overlay = maps.files[file.key];
  if (overlay) {
    file.filename = overlay.filename;
    file.mime_type = overlay.mimeType;
  }
  const pathLabel = fileStorageExplorerPathLabel(file.key, maps.segments);
  if (pathLabel) {
    (file as T & { path_label?: string }).path_label = pathLabel;
  }
  return file;
}

export function applyExplorerFolderOverlay(
  folder: { name: string; prefix: string },
  maps: ExplorerLabelMaps
): { name: string; prefix: string; title?: string } {
  return overlayExplorerFolderName(folder, maps.segments, maps.titles);
}
