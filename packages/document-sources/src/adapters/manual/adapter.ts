import { z } from "zod";
import type { DocumentSourceAdapter } from "../../types.js";

/** Settings for editor-created sources (no scheduled fetch). */
export const manualSourceSettingsSchema = z.object({
  body_markdown: z.string().max(1_000_000).optional().default(""),
  title: z.string().max(512).optional().default(""),
});

export const manualAdapter: DocumentSourceAdapter = {
  createIndex: async () => ({ entries: [], total: 0 }),
  descriptor: {
    id: "manual",
    index_mode: "none",
    label: "Manual entry",
    missing_item_strategies: ["ignore"],
    schedule_default_minutes: null,
    settings_fields: [],
  },
  retrieveItem: async () => {
    throw new Error("manual adapter does not support retrieveItem");
  },
  settingsSchema: manualSourceSettingsSchema,
};
