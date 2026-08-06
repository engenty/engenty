import { describe, expect, it } from "vitest";
import { scopeCoversCapability } from "../../ai/sessions.js";
import { AI_CAPABILITIES } from "../capabilities.js";

/**
 * These pin the assumption the AUTH-06 gate swap rests on: `core.ai.*` sits
 * outside the module tree, so the bundles core hands to members and service
 * credentials cannot reach it. If the matcher's wildcard semantics ever change,
 * this file fails before an admin surface silently opens up.
 *
 * The bundles are copied from CORE_ROLE_PROFILES
 * (apps/core/src/security/role-profiles.ts) and defaultCapabilities()
 * (apps/core/src/security/auth.ts) — apps/ai cannot import from apps/core.
 */
const BUNDLES = {
  member: [
    "module.*",
    "tenant-settings.read",
    "tenant-settings.write",
    "user-settings.read",
    "user-settings.write",
  ],
  service: ["module.read", "module.write", "module.execute"],
  superadmin: ["core.superadmin", "*"],
  tenantAdmin: ["core.credentials.manage", "*"],
} as const;

const ALL_AI_CAPABILITIES = Object.values(AI_CAPABILITIES);

describe("core.ai.* capability coverage", () => {
  it("admits tenant admins and superadmins to every AI admin capability", () => {
    for (const capability of ALL_AI_CAPABILITIES) {
      expect(
        scopeCoversCapability({ capabilities: BUNDLES.tenantAdmin }, capability)
      ).toBe(true);
      expect(
        scopeCoversCapability({ capabilities: BUNDLES.superadmin }, capability)
      ).toBe(true);
    }
  });

  it("excludes members and service credentials from every one of them", () => {
    for (const capability of ALL_AI_CAPABILITIES) {
      expect(
        scopeCoversCapability({ capabilities: BUNDLES.member }, capability)
      ).toBe(false);
      expect(
        scopeCoversCapability({ capabilities: BUNDLES.service }, capability)
      ).toBe(false);
    }
  });

  it("does not let module.* leak into the core tree", () => {
    // The single fact the whole design hangs on.
    expect(
      scopeCoversCapability({ capabilities: ["module.*"] }, "core.ai.dispatch")
    ).toBe(false);
  });

  it("denies a scope with no capabilities at all", () => {
    for (const capability of ALL_AI_CAPABILITIES) {
      expect(scopeCoversCapability({}, capability)).toBe(false);
      expect(scopeCoversCapability({ capabilities: [] }, capability)).toBe(
        false
      );
    }
  });

  it("cannot express superadmin — why those gates stay boolean", () => {
    // A tenant admin's `*` covers `core.superadmin`. Any superadmin gate
    // written as a capability check would therefore admit every tenant admin;
    // gateway-model, model-binding and search-index routes must keep using
    // scope.isSuperAdmin.
    expect(
      scopeCoversCapability(
        { capabilities: BUNDLES.tenantAdmin },
        "core.superadmin"
      )
    ).toBe(true);
  });
});
