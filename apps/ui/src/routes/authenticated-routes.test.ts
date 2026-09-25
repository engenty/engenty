import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const routesDir = dirname(fileURLToPath(import.meta.url));

function readRouteSource(filename: string): string {
  return readFileSync(join(routesDir, filename), "utf8").replace(
    /^\s*\/\/.*$/gm,
    ""
  );
}

const authenticatedSource = readRouteSource("AuthenticatedRoutes.tsx");
const lazyAdminSource = readRouteSource("lazy-admin-pages.tsx");
const adminSettingsSource = readRouteSource("admin-settings-routes.tsx");
const spaceSource = readRouteSource("space-authenticated-routes.tsx");

describe("authenticated route code-splitting", () => {
  it("lazy-loads infrequent admin/settings pages", () => {
    expect(lazyAdminSource).toMatch(/\blazy\b/);
    expect(lazyAdminSource).toContain('import("@/pages/SettingsPage")');
    expect(lazyAdminSource).toContain('import("@/pages/SetupPage")');
    expect(lazyAdminSource).toContain(
      'import("@/pages/AppearanceSettingsPage")'
    );
    expect(lazyAdminSource).toContain('import("@/pages/FeatureFlagsPage")');
    expect(lazyAdminSource).toContain('import("@engenty/ai-ui")');
    expect(lazyAdminSource).toContain('import("@engenty/notifications-ui")');
    expect(adminSettingsSource).toContain('from "@/routes/lazy-admin-pages"');
    expect(authenticatedSource).not.toMatch(
      /from ["']@\/pages\/SettingsPage["']/
    );
    expect(authenticatedSource).not.toMatch(
      /from ["']@\/pages\/FeatureFlagsPage["']/
    );
  });

  it("keeps core shell and common space routes eager", () => {
    expect(spaceSource).toMatch(
      /import \{[\s\S]*SpaceWorkHome[\s\S]*\} from ["']@\/pages\/SpaceWorkHome["']/
    );
    expect(spaceSource).toMatch(
      /import \{[\s\S]*SpaceLayout[\s\S]*\} from ["']@\/pages\/SpaceLayout["']/
    );
    expect(authenticatedSource).toMatch(
      /import \{[\s\S]*CopilotDeskPage[\s\S]*\} from ["']@\/pages\/CopilotDeskPage["']/
    );
    expect(spaceSource).toContain("<SpaceWorkHome");
    expect(spaceSource).not.toMatch(/\blazy\s*\(/);
    expect(spaceSource).not.toMatch(/import\("/);
    expect(authenticatedSource).not.toMatch(/\blazy\s*\(/);
    expect(authenticatedSource).not.toMatch(/import\("/);
  });
});
