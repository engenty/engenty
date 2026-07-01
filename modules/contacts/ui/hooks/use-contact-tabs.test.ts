import { describe, expect, it } from "vitest";
import {
  CONTACT_TABS,
  type ContactTabMeta,
  getVisibleContactTabs,
} from "./use-contact-tabs.js";

describe("getVisibleContactTabs", () => {
  const pluginsAll = {
    isPluginEnabled: () => true,
  };
  const pluginsNone = {
    isPluginEnabled: () => false,
  };

  it("returns overview and info tabs always", () => {
    expect(
      getVisibleContactTabs(null, null).map((t: ContactTabMeta) => t.id)
    ).toContain("overview");
    expect(
      getVisibleContactTabs(null, null).map((t: ContactTabMeta) => t.id)
    ).toContain("info");
    expect(
      getVisibleContactTabs({ type: "person" }, pluginsNone).map(
        (t: ContactTabMeta) => t.id
      )
    ).toEqual(["overview", "info"]);
  });

  it("includes contacts tab only for organisation", () => {
    const orgTabs = getVisibleContactTabs(
      { type: "organisation" },
      pluginsAll
    ).map((t: ContactTabMeta) => t.id);
    const personTabs = getVisibleContactTabs(
      { type: "person" },
      pluginsAll
    ).map((t: ContactTabMeta) => t.id);
    expect(orgTabs).toContain("contacts");
    expect(personTabs).not.toContain("contacts");
  });

  it("includes offers/invoices/projects only when plugin available", () => {
    const withPlugins = getVisibleContactTabs(
      { type: "organisation" },
      pluginsAll
    ).map((t: ContactTabMeta) => t.id);
    const withoutPlugins = getVisibleContactTabs(
      { type: "organisation" },
      pluginsNone
    ).map((t: ContactTabMeta) => t.id);
    expect(withPlugins).toContain("offers");
    expect(withPlugins).toContain("invoices");
    expect(withPlugins).toContain("projects");
    expect(withoutPlugins).not.toContain("offers");
    expect(withoutPlugins).not.toContain("invoices");
    expect(withoutPlugins).not.toContain("projects");
    expect(withoutPlugins).toEqual(["overview", "info", "contacts"]);
  });

  it("CONTACT_TABS has expected shape", () => {
    expect(CONTACT_TABS.length).toBeGreaterThanOrEqual(1);
    expect(CONTACT_TABS[0]).toHaveProperty("id");
    expect(CONTACT_TABS[0]).toHaveProperty("labelKey");
  });
});
