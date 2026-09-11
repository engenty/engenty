import { describe, expect, it } from "vitest";
import {
  canonicalModulePathname,
  isSpaceReservedSegment,
  spaceKeyFromPathname,
  spaceModuleIdFromUrlSegment,
  spaceModuleUrlSegment,
} from "./space-module-url.js";

describe("space module url segments", () => {
  it("shortens an aliased module and passes the rest through", () => {
    expect(spaceModuleUrlSegment("engenty-copilot")).toBe("copilot");
    expect(spaceModuleUrlSegment("offers")).toBe("offers");
    expect(spaceModuleIdFromUrlSegment("copilot")).toBe("engenty-copilot");
    expect(spaceModuleUrlSegment("knowledge-base")).toBe("kb");
    expect(spaceModuleIdFromUrlSegment("kb")).toBe("knowledge-base");
    expect(spaceModuleIdFromUrlSegment("offers")).toBe("offers");
    // A link minted before the alias still names the module.
    expect(spaceModuleIdFromUrlSegment("engenty-copilot")).toBe(
      "engenty-copilot"
    );
  });

  it("knows the space's own pages from a module", () => {
    expect(isSpaceReservedSegment("settings")).toBe(true);
    expect(isSpaceReservedSegment("Data")).toBe(true);
    expect(isSpaceReservedSegment("agents")).toBe(true);
    expect(isSpaceReservedSegment("notifications")).toBe(true);
    expect(isSpaceReservedSegment("offers")).toBe(false);
  });
});

describe("canonicalModulePathname", () => {
  it("rewrites a space-mounted module path to its canonical form", () => {
    expect(canonicalModulePathname("/s/company/offers/settings")).toBe(
      "/mdl/offers/settings"
    );
    expect(canonicalModulePathname("/s/company/tasks/board/abc")).toBe(
      "/mdl/tasks/board/abc"
    );
    expect(canonicalModulePathname("/s/company/offers")).toBe("/mdl/offers");
  });

  it("resolves the module ALIAS, not the URL segment", () => {
    expect(canonicalModulePathname("/s/matthias/copilot/chat/x")).toBe(
      "/mdl/engenty-copilot/chat/x"
    );
    expect(canonicalModulePathname("/s/brain/kb/faqs/f1")).toBe(
      "/mdl/knowledge-base/faqs/f1"
    );
    // A link minted before the alias still resolves.
    expect(canonicalModulePathname("/s/brain/knowledge-base/faqs/f1")).toBe(
      "/mdl/knowledge-base/faqs/f1"
    );
  });

  it("leaves the space's OWN pages alone", () => {
    // `settings` and `data` are placements, not modules — rewriting them would
    // invent a module called "settings" for every reader downstream.
    expect(canonicalModulePathname("/s/company/settings")).toBe(
      "/s/company/settings"
    );
    expect(canonicalModulePathname("/s/company/data")).toBe("/s/company/data");
    expect(canonicalModulePathname("/s/company/agents/custom.researcher")).toBe(
      "/s/company/agents/custom.researcher"
    );
  });

  it("passes through anything that is not a space module path", () => {
    expect(canonicalModulePathname("/mdl/offers/settings")).toBe(
      "/mdl/offers/settings"
    );
    expect(canonicalModulePathname("/s/company")).toBe("/s/company");
    expect(canonicalModulePathname("/settings/spaces")).toBe(
      "/settings/spaces"
    );
    expect(canonicalModulePathname("/")).toBe("/");
  });

  it("decodes an encoded segment before resolving it", () => {
    expect(canonicalModulePathname("/s/my%20space/copilot/chat")).toBe(
      "/mdl/engenty-copilot/chat"
    );
  });
});

describe("notifications is the space's own page", () => {
  it("is reserved, so no module can claim the segment", () => {
    expect(isSpaceReservedSegment("notifications")).toBe(true);
    expect(isSpaceReservedSegment("Notifications")).toBe(true);
  });

  it("keeps `/s/<key>/notifications` out of the module canonicaliser", () => {
    // Same trap as `chats`: a module called "notifications" would hide the
    // space sidebar and show that module's (non-existent) nav.
    expect(canonicalModulePathname("/s/company/notifications")).toBe(
      "/s/company/notifications"
    );
  });
});

describe("chats is the space's own page", () => {
  it("is reserved, so no module can claim the segment", () => {
    expect(isSpaceReservedSegment("chats")).toBe(true);
    expect(isSpaceReservedSegment("CHATS")).toBe(true);
  });

  it("keeps `/s/<key>/chats` out of the module canonicaliser", () => {
    // A module called "chats" would make the shell hide the space's own
    // sidebar to show that module's (non-existent) nav — the same trap
    // `settings` and `data` are reserved against.
    expect(canonicalModulePathname("/s/company/chats")).toBe(
      "/s/company/chats"
    );
  });
});

describe("which space a pathname is in", () => {
  it("reads the key out of a space URL", () => {
    expect(spaceKeyFromPathname("/s/company")).toBe("company");
    expect(spaceKeyFromPathname("/s/company/copilot/chat/abc")).toBe("company");
    expect(spaceKeyFromPathname("/s/kunde%20m%C3%BCller")).toBe("kunde müller");
  });

  it("answers NULL outside a space rather than guessing a default", () => {
    // Callers use this to ask "am I in a space at all"; a fallback here would
    // make every module page claim to be inside one.
    expect(spaceKeyFromPathname("/mdl/engenty-copilot/chat")).toBeNull();
    expect(spaceKeyFromPathname("/settings/appearance")).toBeNull();
    expect(spaceKeyFromPathname("/s/")).toBeNull();
    expect(spaceKeyFromPathname("/s")).toBeNull();
  });

  it("stops at the first segment, query and hash included", () => {
    expect(spaceKeyFromPathname("/s/company?tab=1")).toBe("company");
    expect(spaceKeyFromPathname("/s/company#top")).toBe("company");
  });
});
