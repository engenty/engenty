import { z } from "zod";
import type { DocumentSourceAdapter } from "../../types.js";

/** Settings for vault-backed uploads (filled by the KB module on create). */
export const fileUploadSourceSettingsSchema = z.object({
  original_filename: z.string().max(512).optional().default(""),
  storage_object_key: z.string().max(2048).optional().default(""),
});

export const fileUploadAdapter: DocumentSourceAdapter = {
  createIndex: async () => ({ entries: [], total: 0 }),
  descriptor: {
    id: "file_upload",
    index_mode: "none",
    label: "File upload",
    missing_item_strategies: ["ignore"],
    schedule_default_minutes: null,
    settings_fields: [],
  },
  retrieveItem: async () => {
    throw new Error("file_upload adapter does not support retrieveItem");
  },
  settingsSchema: fileUploadSourceSettingsSchema,
};
