import { describe, expect, it } from "vitest";
import { mergeKbSourceAdaptersForPicker } from "../ui/kb-source-adapters-merge.js";

describe("mergeKbSourceAdaptersForPicker", () => {
  it("includes firecrawl_url when API omits it", () => {
    const merged = mergeKbSourceAdaptersForPicker([
      {
        id: "url",
        label: "External URLs",
        missing_item_strategies: ["ignore"],
        schedule_default_minutes: 1440,
        settings_fields: [],
      },
      {
        id: "sitemap",
        label: "Sitemap",
        missing_item_strategies: ["ignore"],
        schedule_default_minutes: 1440,
        settings_fields: [],
      },
      {
        id: "web_index",
        label: "Web Index",
        missing_item_strategies: ["ignore"],
        schedule_default_minutes: 1440,
        settings_fields: [],
      },
    ]);

    expect(merged.map((a) => a.id)).toEqual([
      "url",
      "firecrawl_url",
      "sitemap",
      "web_index",
      "manual",
      "file_upload",
    ]);
    expect(merged.find((a) => a.id === "firecrawl_url")?.label).toMatch(
      /Firecrawl/i
    );
  });

  it("returns built-ins when API returns empty", () => {
    const merged = mergeKbSourceAdaptersForPicker([]);
    expect(merged.length).toBe(6);
  });

  it("uses registry settings_fields for built-ins even when API sends stale fields", () => {
    const merged = mergeKbSourceAdaptersForPicker([
      {
        id: "url",
        label: "External URLs",
        missing_item_strategies: ["ignore"],
        schedule_default_minutes: 1440,
        settings_fields: [
          { key: "url", label: "URL", required: true, type: "url" },
          { key: "title", label: "Title", type: "text" },
        ],
      },
    ]);
    const keys = merged
      .find((a) => a.id === "url")
      ?.settings_fields.map((f) => f.key);
    expect(keys).toEqual([
      "url",
      "strategy",
      "media_capture_mode",
      "media_max_file_size_mb",
      "media_allowed_mime_prefixes",
    ]);
  });
});
