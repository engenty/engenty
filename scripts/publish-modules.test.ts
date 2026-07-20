import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs sibling, no type declarations.
import {
  moduleTier,
  REGISTRY,
  transformModuleManifestForPublish,
} from "./publish-modules.mjs";

describe("transformModuleManifestForPublish", () => {
  const base = {
    name: "@engenty/tasks",
    version: "0.0.1",
    private: true,
    dependencies: {
      "@engenty/ui-core": "workspace:*",
      "@engenty/plugin-sdk": "workspace:*",
      "date-fns": "^4.4.0",
      react: "^19.2.7",
    },
    devDependencies: { tsup: "^8.5.1", typescript: "^6.0.3" },
  };

  it("drops private and stamps the release version", () => {
    const out = transformModuleManifestForPublish(base, { version: "0.1.45" });
    expect(out.private).toBeUndefined();
    expect(out.version).toBe("0.1.45");
  });

  it("moves internal @engenty deps to peerDependencies (host-provided)", () => {
    const out = transformModuleManifestForPublish(base, { version: "0.1.45" });
    expect(out.peerDependencies).toEqual({
      "@engenty/ui-core": "*",
      "@engenty/plugin-sdk": "*",
    });
    // internal deps are gone from dependencies
    expect(out.dependencies["@engenty/ui-core"]).toBeUndefined();
  });

  it("keeps third-party deps as real dependencies", () => {
    const out = transformModuleManifestForPublish(base, { version: "0.1.45" });
    expect(out.dependencies).toEqual({
      "date-fns": "^4.4.0",
      react: "^19.2.7",
    });
  });

  it("drops devDependencies and pins the registry", () => {
    const out = transformModuleManifestForPublish(base, { version: "0.1.45" });
    expect(out.devDependencies).toBeUndefined();
    expect(out.publishConfig).toEqual({ registry: REGISTRY });
  });

  it("does not mutate the input manifest", () => {
    const snapshot = JSON.stringify(base);
    transformModuleManifestForPublish(base, { version: "0.1.45" });
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it("tags engenty.tier when a tier is given", () => {
    const out = transformModuleManifestForPublish(base, {
      version: "0.1.48",
      tier: "pro",
    });
    expect(out.engenty).toEqual({ tier: "pro" });
  });

  it("omits dependencies entirely when only internal deps exist", () => {
    const out = transformModuleManifestForPublish(
      {
        name: "@engenty/thin",
        version: "0.0.1",
        dependencies: { "@engenty/plugin-sdk": "workspace:*" },
      },
      { version: "0.1.45" }
    );
    expect(out.dependencies).toBeUndefined();
    expect(out.peerDependencies).toEqual({ "@engenty/plugin-sdk": "*" });
  });
});

describe("moduleTier", () => {
  const closed = [
    "modules/time-tracking",
    "modules/team-chat/providers/slack-bridge",
  ];

  it("classifies a closed-prefix module as pro", () => {
    expect(moduleTier("modules/time-tracking", closed)).toBe("pro");
  });

  it("classifies a nested closed provider as pro", () => {
    expect(moduleTier("modules/team-chat/providers/slack-bridge", closed)).toBe(
      "pro"
    );
  });

  it("classifies everything else as open", () => {
    expect(moduleTier("modules/tasks", closed)).toBe("open");
    // team-chat itself is open even though a nested provider is pro
    expect(moduleTier("modules/team-chat", closed)).toBe("open");
  });
});
