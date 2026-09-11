/**
 * Background sweep for spaces marked for deletion.
 *
 * Marks hide the space immediately; this loop waits until `purge_after`, then
 * removes stored bytes under the space prefix and calls `core.purge_space` so
 * the row and the records it owns go together.
 */
import { fileStorageSpacePrefix } from "@engenty/file-storage";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listSpacesDueForPurge,
  purgeSpace,
  type Space,
} from "../dal/spaces.js";

const logger = createLogger({ name: "apps/core/space-purge" });

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const FILES_BUCKET = "files";

export interface SpacePurgeStorage {
  deletePrefix: (prefix: string) => Promise<void>;
}

export async function deleteStoragePrefix(params: {
  list: (prefix: string) => Promise<Array<{ id: string | null; name: string }>>;
  prefix: string;
  remove: (paths: string[]) => Promise<void>;
}): Promise<void> {
  const prefix = params.prefix.replace(/\/+$/, "");
  const entries = await params.list(prefix);
  const files: string[] = [];
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id == null) {
      await deleteStoragePrefix({ ...params, prefix: path });
      continue;
    }
    files.push(path);
  }
  if (files.length > 0) {
    await params.remove(files);
  }
}

export function createSupabaseSpacePurgeStorage(
  client: SupabaseClient,
  bucket = FILES_BUCKET
): SpacePurgeStorage {
  const from = client.storage.from(bucket);
  return {
    async deletePrefix(prefix) {
      await deleteStoragePrefix({
        list: async (path) => {
          const { data, error } = await from.list(path, { limit: 1000 });
          if (error) {
            throw error;
          }
          return (data ?? []).map((entry) => ({
            id: entry.id ?? null,
            name: entry.name,
          }));
        },
        prefix,
        remove: async (paths) => {
          const { error } = await from.remove(paths);
          if (error) {
            throw error;
          }
        },
      });
    },
  };
}

export async function purgeDueSpaces(params: {
  client: SupabaseClient;
  now?: Date;
  storage?: SpacePurgeStorage;
}): Promise<{ failed: number; purged: number }> {
  const due = await listSpacesDueForPurge(params.client, params.now);
  let purged = 0;
  let failed = 0;
  for (const space of due) {
    try {
      await purgeOneSpace(params.client, space, params.storage);
      purged += 1;
    } catch (error) {
      failed += 1;
      logger.error("space purge failed", {
        error: error instanceof Error ? error.message : String(error),
        spaceId: space.id,
        tenantId: space.tenantId,
      });
    }
  }
  return { failed, purged };
}

async function purgeOneSpace(
  client: SupabaseClient,
  space: Space,
  storage: SpacePurgeStorage | undefined
): Promise<void> {
  if (storage) {
    try {
      await storage.deletePrefix(
        fileStorageSpacePrefix(space.tenantId, space.id)
      );
    } catch (error) {
      logger.warn(
        "space storage prefix delete failed; continuing with row purge",
        {
          error: error instanceof Error ? error.message : String(error),
          spaceId: space.id,
          tenantId: space.tenantId,
        }
      );
    }
  }
  await purgeSpace(client, space.tenantId, space.id);
}

export function startSpacePurgeLoop(params: {
  client: SupabaseClient;
  intervalMs?: number;
  storage?: SpacePurgeStorage;
}): () => void {
  const intervalMs = params.intervalMs ?? DEFAULT_INTERVAL_MS;
  const tick = () => {
    void purgeDueSpaces({
      client: params.client,
      ...(params.storage ? { storage: params.storage } : {}),
    }).then((result) => {
      if (result.purged > 0 || result.failed > 0) {
        logger.info("space purge sweep", result);
      }
    });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  return () => {
    clearInterval(timer);
  };
}
