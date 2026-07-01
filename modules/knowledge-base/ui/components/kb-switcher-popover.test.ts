import { describe, expect, it } from "vitest";
import type { KnowledgeBase } from "../../src/schema/types.js";
import {
  buildKbSwitcherItems,
  buildKbSwitcherSections,
  KB_SWITCHER_SEARCH_THRESHOLD,
} from "./kb-switcher-popover.js";

describe("KB_SWITCHER_SEARCH_THRESHOLD", () => {
  it("enables search at three or more knowledge bases", () => {
    expect(KB_SWITCHER_SEARCH_THRESHOLD).toBe(3);
  });
});

describe("buildKbSwitcherItems", () => {
  const t = (key: string) => key;

  const kbs: KnowledgeBase[] = [
    {
      id: "kb-1",
      name: "Engineering",
      slug: "engineering",
      description: null,
      is_default: false,
      tenant_id: "t",
      scope_id: "s",
      created_at: "",
      updated_at: "",
      icon: null,
      article_property_definitions: [],
    },
    {
      id: "kb-2",
      name: "Sales",
      slug: "sales",
      description: null,
      is_default: true,
      tenant_id: "t",
      scope_id: "s",
      created_at: "",
      updated_at: "",
      icon: null,
      article_property_definitions: [],
    },
  ];

  it("returns one row per knowledge base with active flag", () => {
    const items = buildKbSwitcherItems(kbs, "kb-2", () => {}, t);
    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe("kb-1");
    expect(items[1]?.isActive).toBe(true);
  });

  it("drives selection through onClick/onSelect, not a `to` link", () => {
    const selected: string[] = [];
    const items = buildKbSwitcherItems(
      kbs,
      "kb-2",
      (id) => selected.push(id),
      t
    );
    expect(items[0]?.to).toBeUndefined();
    items[0]?.onClick?.();
    expect(selected).toEqual(["kb-1"]);
  });
});

describe("buildKbSwitcherSections", () => {
  const t = (key: string) => key;

  const kbs: KnowledgeBase[] = [
    {
      id: "kb-1",
      name: "Engineering",
      slug: "engineering",
      description: null,
      is_default: false,
      tenant_id: "t",
      scope_id: "s",
      created_at: "",
      updated_at: "",
      icon: null,
      article_property_definitions: [],
    },
  ];

  it("includes scoped nav shortcuts when the active KB has a slug", () => {
    const sections = buildKbSwitcherSections({
      activeKbId: "kb-1",
      kbs,
      onSelect: () => {},
      pathname: "/mdl/knowledge-base/kb/engineering",
      locationSearch: "",
      searchQuery: "",
      showSearch: false,
      t,
    });
    expect(sections).toHaveLength(2);
    expect(sections?.[0]?.id).toBe("knowledge-bases");
    expect(sections?.[1]?.id).toBe("shortcuts");
    expect(sections?.[1]?.items.map((item) => item.id)).toEqual([
      "hub",
      "articles",
      "faqs",
      "sources",
      "graph",
      "settings",
    ]);
  });
});
