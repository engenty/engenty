import { describe, expect, it, vi } from "vitest";
import type { KnowledgeBase } from "../schema/types.js";
import {
  defaultKbSlugForSpace,
  ensureSpaceKnowledgeBase,
  kbSpaceMountNeeds,
} from "./kb-space-mount.js";

const SPACE = "01a0712c-4447-73be-8eca-78879d76a022";

function kb(overrides: Partial<KnowledgeBase>): KnowledgeBase {
  return {
    id: "kb-1",
    name: "x",
    slug: "x",
    space_id: SPACE,
    ...overrides,
  } as KnowledgeBase;
}

function repos(input: {
  all?: KnowledgeBase[];
  inSpace?: KnowledgeBase[];
  space?: { key: string; name: string } | null;
}) {
  const create = vi.fn(async (row: { name: string; slug: string }) =>
    kb({ id: "kb-new", name: row.name, slug: row.slug })
  );
  return {
    create,
    repos: {
      kb: {
        create,
        list: async (filter?: { spaceId?: string | null }) =>
          filter?.spaceId ? (input.inSpace ?? []) : (input.all ?? []),
      },
      spaces: { getById: async () => input.space ?? null },
    } as never,
  };
}

const withKey = { readAiGatewayApiKey: () => "key" };

describe("ensureSpaceKnowledgeBase", () => {
  it("creates <space name>-kb with a <space key>-kb slug", async () => {
    const { repos: r, create } = repos({
      space: { key: "brain", name: "Brain" },
    });
    const result = await ensureSpaceKnowledgeBase(r, SPACE, withKey);
    expect(create).toHaveBeenCalledWith({
      description: null,
      name: "Brain-kb",
      slug: "brain-kb",
      space_id: SPACE,
    });
    expect(result).toMatchObject({ created: true, needs: [], ready: true });
  });

  it("answers the existing library instead of creating a second one", async () => {
    const existing = kb({ id: "kb-old", name: "Mastra" });
    const { repos: r, create } = repos({
      inSpace: [existing],
      space: { key: "brain", name: "Brain" },
    });
    const result = await ensureSpaceKnowledgeBase(r, SPACE, withKey);
    expect(create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: false, knowledge_base: existing });
  });

  it("refuses a space that does not exist in this tenant", async () => {
    const { repos: r } = repos({ space: null });
    await expect(ensureSpaceKnowledgeBase(r, SPACE, withKey)).rejects.toThrow(
      /does not exist/
    );
  });

  it("reports the AI gateway as a need without refusing the mount", async () => {
    const { repos: r, create } = repos({
      space: { key: "brain", name: "Brain" },
    });
    const result = await ensureSpaceKnowledgeBase(r, SPACE, {
      readAiGatewayApiKey: () => undefined,
    });
    expect(create).toHaveBeenCalled();
    expect(result).toMatchObject({ needs: ["ai_gateway"], ready: false });
  });
});

describe("defaultKbSlugForSpace", () => {
  it("steps past a slug a moved library kept", () => {
    // A library keeps its slug when it moves to another space.
    expect(defaultKbSlugForSpace("brain", new Set(["brain-kb"]))).toBe(
      "brain-kb-2"
    );
    expect(defaultKbSlugForSpace("Ünïcode Key", new Set())).toBe(
      "unicode-key-kb"
    );
  });
});

describe("kbSpaceMountNeeds", () => {
  it("is empty once the gateway key is set", () => {
    expect(kbSpaceMountNeeds(() => "k")).toEqual([]);
    expect(kbSpaceMountNeeds(() => undefined)).toEqual(["ai_gateway"]);
  });
});
