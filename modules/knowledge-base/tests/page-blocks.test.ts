import { describe, expect, it } from "vitest";
import { KB_CATEGORY_PAGE_SETTINGS_DEFAULTS } from "../src/schema/categories.js";
import {
  KB_CATEGORY_PAGE_BLOCKS_DEFAULTS,
  KB_HUB_PAGE_LAYOUT_DEFAULTS,
  legacyCategoryCountFlagsToDisplay,
  migrateLegacyCategoryToBlocks,
  movePageBlock,
  normalizeKbPageLayoutSettings,
} from "../src/schema/page-blocks.js";

describe("page blocks normalize", () => {
  it("hub defaults to categories + latest articles + faqs", () => {
    const layout = normalizeKbPageLayoutSettings(null);
    expect(layout.blocks).toHaveLength(3);
    expect(layout.blocks[0]?.type).toBe("categories");
    expect(layout.blocks[1]?.type).toBe("articles");
    expect(layout.blocks[2]?.type).toBe("faqs");
    expect(
      layout.blocks[1]?.type === "articles" && layout.blocks[1].source
    ).toBe("recent_updated_recursive");
  });

  it("appends missing faqs block for hub legacy layouts", () => {
    const layout = normalizeKbPageLayoutSettings(
      {
        blocks: [
          {
            id: "hub-default-categories",
            type: "categories",
            visible: true,
            headline: null,
            style: "cards",
            category_count_display: "direct",
            show_icon: true,
            show_description: true,
            show_articles: false,
            articles_sort_by: "sort_order",
            articles_max_items: 6,
            articles_include_drafts: false,
            scope: "direct_children",
            manual_category_ids: [],
            sort: "sort_order",
          },
          {
            id: "hub-default-articles",
            type: "articles",
            visible: true,
            headline: null,
            style: "list",
            grouped_by_category: false,
            show_icon: false,
            show_description: true,
            source: "recent_updated_recursive",
            sort_by: "sort_order",
            max_items: 8,
            include_drafts: false,
            manual_article_ids: [],
            property_filters: {},
          },
        ],
      },
      undefined,
      { append_missing_faqs: true }
    );
    expect(layout.blocks).toHaveLength(3);
    expect(layout.blocks.at(-1)?.type).toBe("faqs");
  });

  it("does not append faqs block for category layouts", () => {
    const layout = normalizeKbPageLayoutSettings(
      { blocks: [] },
      KB_CATEGORY_PAGE_BLOCKS_DEFAULTS
    );
    expect(layout.blocks).toHaveLength(2);
    expect(layout.blocks.some((b) => b.type === "faqs")).toBe(false);
  });

  it("migrates legacy category page_settings with intro/outro", () => {
    const blocks = migrateLegacyCategoryToBlocks({
      intro_json: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello intro" }],
          },
        ],
      },
      intro_markdown: "Hello intro",
      outro_json: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Bye outro" }],
          },
        ],
      },
      page_settings: {
        section_order: ["article_list", "subcat_teasers"],
        subcat_teasers: { visible: true, headline: "Topics" },
        article_list: {
          visible: false,
          headline: "Pages",
          source: "recent_updated",
          style: "list",
          max_items: 12,
          manual_article_ids: [],
          property_filters: {},
        },
      },
    });
    expect(blocks[0]?.type).toBe("content");
    expect(blocks[1]?.type).toBe("articles");
    expect(blocks[1]?.type === "articles" && blocks[1].visible).toBe(false);
    expect(blocks[2]?.type).toBe("categories");
    expect(blocks.at(-1)?.type).toBe("content");
  });

  it("moves blocks up and down", () => {
    const layout = normalizeKbPageLayoutSettings(KB_HUB_PAGE_LAYOUT_DEFAULTS);
    const firstId = layout.blocks[0]?.id ?? "";
    const moved = movePageBlock(layout, firstId, 1);
    expect(moved.blocks[0]?.type).toBe("articles");
    expect(moved.blocks[1]?.type).toBe("categories");
  });

  it("category defaults include two blocks", () => {
    expect(KB_CATEGORY_PAGE_SETTINGS_DEFAULTS.blocks).toHaveLength(2);
  });

  it("hub categories default uses direct count display", () => {
    const layout = normalizeKbPageLayoutSettings(null);
    const categories = layout.blocks.find((b) => b.type === "categories");
    expect(categories?.type).toBe("categories");
    if (categories?.type === "categories") {
      expect(categories.category_count_display).toBe("direct");
    }
  });

  it("migrates legacy category count checkboxes to category_count_display", () => {
    const layout = normalizeKbPageLayoutSettings({
      blocks: [
        {
          id: "cat-1",
          type: "categories",
          visible: true,
          headline: null,
          style: "cards",
          show_count_direct: false,
          show_count_recursive: true,
          show_icon: true,
          show_description: true,
          show_articles: false,
          articles_sort_by: "sort_order",
          articles_max_items: 6,
          articles_include_drafts: false,
          scope: "direct_children",
          manual_category_ids: [],
          sort: "sort_order",
        },
      ],
    });
    const block = layout.blocks[0];
    expect(block?.type).toBe("categories");
    if (block?.type === "categories") {
      expect(block.category_count_display).toBe("recursive");
      expect("show_count_direct" in block).toBe(false);
      expect("show_count_recursive" in block).toBe(false);
    }
  });

  it("strips legacy count flags from articles blocks on normalize", () => {
    const layout = normalizeKbPageLayoutSettings({
      blocks: [
        {
          id: "art-1",
          type: "articles",
          visible: true,
          headline: null,
          style: "list",
          show_count_direct: true,
          show_count_recursive: true,
          grouped_by_category: false,
          show_icon: false,
          show_description: true,
          source: "direct_sorted",
          sort_by: "sort_order",
          max_items: 10,
          include_drafts: false,
          manual_article_ids: [],
          property_filters: {},
        },
      ],
    });
    const block = layout.blocks[0];
    expect(block?.type).toBe("articles");
    if (block?.type === "articles") {
      expect("show_count_direct" in block).toBe(false);
      expect("show_count_recursive" in block).toBe(false);
    }
  });
});

describe("legacyCategoryCountFlagsToDisplay", () => {
  it("maps boolean pairs to a single display mode", () => {
    expect(legacyCategoryCountFlagsToDisplay(false, false)).toBe("none");
    expect(legacyCategoryCountFlagsToDisplay(true, false)).toBe("direct");
    expect(legacyCategoryCountFlagsToDisplay(false, true)).toBe("recursive");
    expect(legacyCategoryCountFlagsToDisplay(true, true)).toBe("recursive");
  });
});
