import { describe, expect, it } from "vitest";
import {
  parseLegacyModuleLink,
  spaceMirroredRoutes,
  spaceMirrorPath,
  spacePlacedModuleIds,
} from "./space-route-mirrors";

describe("space route mirrors", () => {
  it("mirrors a module route relative to the space layout route", () => {
    expect(spaceMirrorPath("/mdl/offers/:id/draft")).toBe("offers/:id/draft");
    expect(spaceMirrorPath("/mdl/offers")).toBe("offers");
  });

  it("leaves non-module routes alone", () => {
    // Settings, admin consoles and setup have no in-space form; mirroring them
    // would put a tenant-config page inside a container it does not belong to.
    expect(spaceMirrorPath("/settings/spaces")).toBeNull();
    expect(spaceMirrorPath("/admin/agents")).toBeNull();
    expect(spaceMirrorPath("/setup/plugins")).toBeNull();
  });

  it("mirrors every module route, not only space-placed ones", () => {
    // Contacts is global-placement and still mountable per space (§1b-bis);
    // filtering by placement here would 404 it inside a space.
    const mirrors = spaceMirroredRoutes([
      { id: "a", path: "/mdl/contacts", pluginId: "contacts" },
      { id: "b", path: "/mdl/offers/:id", pluginId: "offers" },
      { id: "c", path: "/settings/team", pluginId: "team" },
    ]);
    expect(mirrors.map((m) => m.path)).toEqual(["contacts", "offers/:id"]);
  });

  it("reads space placement off the enriched menu items", () => {
    const ids = spacePlacedModuleIds([
      { moduleId: "offers", placement: "space", pluginId: "offers" },
      { placement: "global", pluginId: "inbox" },
      { pluginId: "unknown-placement" },
    ]);
    expect([...ids]).toEqual(["offers"]);
  });

  it("reads it off a copilot app too, which contributes no menu row", () => {
    // The copilot's only contribution is a copilot app, so a caller passing
    // just `adminMenuItems` sees no placement for it and keeps `/mdl/` — which
    // is how chat would stay outside every space if the call site omitted it.
    // The function is contribution-shaped on purpose. `/mdl/engenty-copilot`
    // is still the personal desk: the route wrapper skips the redirect, this
    // helper only reports placement.
    const ids = spacePlacedModuleIds([
      { placement: "global", pluginId: "inbox" },
      { placement: "space", pluginId: "engenty-copilot" },
    ]);
    expect([...ids]).toEqual(["engenty-copilot"]);
  });

  it("splits a legacy link into module, record and rest", () => {
    expect(parseLegacyModuleLink("/mdl/offers/123/draft")).toEqual({
      moduleId: "offers",
      recordId: "123",
      rest: "123/draft",
    });
    expect(parseLegacyModuleLink("/mdl/offers")).toEqual({
      moduleId: "offers",
      rest: "",
    });
  });

  it("does not mistake a settings sub-page for a record", () => {
    expect(parseLegacyModuleLink("/mdl/offers/settings")).toEqual({
      moduleId: "offers",
      rest: "settings",
    });
  });

  it("does not mistake an import sub-page for a record", () => {
    expect(parseLegacyModuleLink("/mdl/expenses/import")).toEqual({
      moduleId: "expenses",
      rest: "import",
    });
    expect(parseLegacyModuleLink("/mdl/contacts/import")).toEqual({
      moduleId: "contacts",
      rest: "import",
    });
  });

  it("is not fooled by a path that only looks like a module link", () => {
    expect(parseLegacyModuleLink("/s/marketing/offers")).toBeNull();
    expect(parseLegacyModuleLink("/mdl/")).toBeNull();
  });
});

describe("short URL segments", () => {
  it("mirrors an aliased module under its short segment", () => {
    const [mirror] = spaceMirroredRoutes([
      {
        id: "copilot-chat",
        path: "/mdl/engenty-copilot/chat/:threadId",
        pluginId: "engenty-copilot",
      },
    ]);
    expect(mirror?.path).toBe("copilot/chat/:threadId");
    // Space deep links minted before the alias must still open the page.
    expect(mirror?.legacyPath).toBe("engenty-copilot/chat/:threadId");
  });

  it("leaves an unaliased module alone, and mounts it exactly once", () => {
    const [mirror] = spaceMirroredRoutes([
      { id: "offers", path: "/mdl/offers/:id", pluginId: "offers" },
    ]);
    expect(mirror?.path).toBe("offers/:id");
    expect(mirror?.legacyPath).toBeUndefined();
  });

  it("aliases a bare module route with no sub-path", () => {
    expect(spaceMirrorPath("/mdl/engenty-copilot")).toBe("copilot");
  });
});
