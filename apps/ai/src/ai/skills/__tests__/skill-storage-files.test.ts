import { describe, expect, it } from "vitest";
import { createSkillStorage } from "../skill-storage.js";

function memoryClient(seed: Record<string, string> = {}) {
  const objects = new Map<string, Uint8Array>(
    Object.entries(seed).map(([key, value]) => [
      key,
      new TextEncoder().encode(value),
    ])
  );
  return {
    delete: async (key: string) => {
      objects.delete(key);
    },
    download: async (key: string) => objects.get(key) ?? null,
    exists: async (key: string) => objects.has(key),
    list: async (prefix: string) =>
      [...objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key })),
    upload: async (key: string, bytes: Uint8Array) => {
      objects.set(key, bytes);
    },
  };
}

describe("skill-storage nested files", () => {
  it("lists SKILL.md and nested paths without a leading slash", async () => {
    const tenantId = "tenant-nested-files";
    const prefix = `tenants/${tenantId}/ai/skills/custom/remotion-video-creation`;
    const storage = createSkillStorage({
      storage: memoryClient({
        [`${prefix}/SKILL.md`]:
          "---\nname: remotion-video-creation\n---\n\n# Video\n",
        [`${prefix}/rules/3d.md`]: "# 3D\n",
        [`${prefix}/rules/display-captions.md`]: "# Captions\n",
      }) as never,
      tenantId,
    });

    const skill = await storage.getSkill("remotion-video-creation");
    expect(skill?.files.map((file) => file.path)).toEqual([
      "SKILL.md",
      "rules/3d.md",
      "rules/display-captions.md",
    ]);
    await expect(
      storage.readSkillFile("remotion-video-creation", "/rules/3d.md")
    ).resolves.toBeTruthy();
  });

  it("writes a nested custom file without a leading slash", async () => {
    const tenantId = "tenant-write-nested";
    const prefix = `tenants/${tenantId}/ai/skills/custom/demo-skill`;
    const client = memoryClient({
      [`${prefix}/SKILL.md`]: "---\nname: demo-skill\n---\n\n# Demo\n",
    });
    const storage = createSkillStorage({ storage: client as never, tenantId });
    await storage.writeCustomSkillFile({
      bytes: new TextEncoder().encode("# Captions\n"),
      name: "demo-skill",
      path: "/rules/display-captions.md",
    });
    const skill = await storage.getSkill("demo-skill");
    expect(skill?.files.map((file) => file.path)).toEqual([
      "SKILL.md",
      "rules/display-captions.md",
    ]);
  });
});
