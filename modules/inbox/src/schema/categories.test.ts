import { describe, expect, it } from "vitest";
import {
  buildCategoryGuide,
  defaultInboxCategories,
  FIXED_INBOX_CATEGORIES,
  mergeInboxCategories,
  normalizeCategorySlug,
  visibleInboxCategories,
} from "../schema/categories.js";
import type { InboxMessage } from "../schema/types.js";
import {
  applyCategoryMap,
  coerceCategoryMap,
} from "../services/message-classify.js";

describe("normalizeCategorySlug", () => {
  it("lowercases and strips invalid characters", () => {
    expect(normalizeCategorySlug(" My Vendor / Ops ")).toBe("my-vendor-ops");
    expect(normalizeCategorySlug("A__B")).toBe("a__b");
  });
});

describe("mergeInboxCategories", () => {
  it("returns defaults for empty input", () => {
    const config = mergeInboxCategories(null);
    expect(config.items.map((item) => item.slug)).toEqual([
      ...FIXED_INBOX_CATEGORIES,
    ]);
    expect(config.items.every((item) => item.visible)).toBe(true);
  });

  it("re-injects missing fixed categories and keeps custom ones", () => {
    const config = mergeInboxCategories({
      items: [
        { slug: "conversation", order: 0, visible: false },
        {
          slug: "vendor",
          title: "Vendor",
          rule: "mail from vendors",
          order: 1,
          visible: true,
        },
      ],
    });
    const slugs = config.items.map((item) => item.slug);
    expect(slugs).toContain("vendor");
    for (const fixed of FIXED_INBOX_CATEGORIES) {
      expect(slugs).toContain(fixed);
    }
    expect(
      config.items.find((item) => item.slug === "conversation")?.visible
    ).toBe(false);
    expect(config.items.find((item) => item.slug === "vendor")?.rule).toBe(
      "mail from vendors"
    );
  });

  it("rewrites order after sort", () => {
    const config = mergeInboxCategories({
      items: [
        { slug: "spam", order: 0, visible: true },
        { slug: "conversation", order: 5, visible: true },
      ],
    });
    expect(config.items[0]?.order).toBe(0);
    expect(config.items.at(-1)?.order).toBe(config.items.length - 1);
  });
});

describe("buildCategoryGuide", () => {
  it("includes custom rules and the tiebreaker", () => {
    const guide = buildCategoryGuide([
      {
        order: 0,
        rule: "messages about invoices",
        slug: "billing",
        visible: true,
      },
      ...defaultInboxCategories().items.slice(0, 1),
    ]);
    expect(guide).toContain("- billing: messages about invoices");
    expect(guide).toContain("Judge by the sender's purpose");
  });
});

describe("visibleInboxCategories", () => {
  it("filters hidden rows and keeps order", () => {
    const visible = visibleInboxCategories({
      items: [
        { slug: "spam", order: 2, visible: true },
        { slug: "conversation", order: 0, visible: false },
        { slug: "newsletter", order: 1, visible: true },
      ],
    });
    expect(visible.map((item) => item.slug)).toEqual(["newsletter", "spam"]);
  });
});

function stubMessage(id: string): InboxMessage {
  return {
    ai_category: null,
    attachments_json: [],
    body_html: null,
    body_text: null,
    cc_emails: [],
    classification: null,
    classification_reason: null,
    connection_id: "c",
    created_at: "2026-01-01T00:00:00Z",
    from_email: null,
    from_name: null,
    has_attachments: false,
    id,
    owner_user_id: null,
    provider_message_id: id,
    provider_thread_id: null,
    received_at: null,
    scope_id: "default",
    snippet: null,
    status: "new",
    status_set_by: null,
    subject: null,
    tenant_id: "t",
    thread_id: "th",
    to_emails: [],
    updated_at: "2026-01-01T00:00:00Z",
    user_classification: null,
  };
}

describe("coerceCategoryMap with custom allowlist", () => {
  it("accepts custom slugs from the tenant catalog", () => {
    const allowlist = ["conversation", "billing", "spam"];
    expect(
      coerceCategoryMap({ "0": "billing", "1": "spam" }, allowlist)
    ).toEqual({ "0": "billing", "1": "spam" });
    expect(coerceCategoryMap({ "0": "newsletter" }, allowlist)).toBeNull();
  });

  it("maps missing indices to conversation when present in allowlist", () => {
    const batch = [stubMessage("a"), stubMessage("b")];
    const mapped = applyCategoryMap(batch, { "0": "billing" }, [
      "conversation",
      "billing",
    ]);
    expect(mapped.get("a")).toBe("billing");
    expect(mapped.get("b")).toBe("conversation");
  });
});
