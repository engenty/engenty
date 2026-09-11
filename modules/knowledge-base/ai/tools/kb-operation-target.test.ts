import { describe, expect, it, vi } from "vitest";
import {
  kbTargetRequired,
  resolveKbIdForScopedRead,
} from "./kb-operation-target.js";

const kbA = {
  id: "kb-a",
  name: "Fundings",
  slug: "fundings",
  tenant_id: "t1",
  scope_id: "default",
  space_id: "space-1",
  description: null,
  created_at: "",
  updated_at: "",
  created_by: null,
  deleted_at: null,
  article_property_definitions: [],
  chunking: null,
  cover: null,
  cover_inheritance: "none",
  icon: null,
};

const kbB = { ...kbA, id: "kb-b", name: "Internal", slug: "internal" };

function makeRepos(overrides: {
  list?: (filter?: { spaceId?: string | null }) => Promise<(typeof kbA)[]>;
  getById?: (id: string) => Promise<typeof kbA | null>;
}) {
  return {
    kb: {
      list: vi.fn(overrides.list ?? (async () => [])),
      getById: vi.fn(overrides.getById ?? (async () => null)),
    },
    spaces: { keyById: vi.fn(async () => "brain") },
  };
}

describe("resolveKbIdForScopedRead", () => {
  it("uses explicit kb_id when valid", async () => {
    const repos = makeRepos({
      getById: async (id) => (id === "kb-a" ? kbA : null),
    });
    await expect(
      resolveKbIdForScopedRead(repos as never, "kb-a")
    ).resolves.toBe("kb-a");
  });

  it("uses the only KB in scope without being asked", async () => {
    const repos = makeRepos({ list: async () => [kbA] });
    await expect(
      resolveKbIdForScopedRead(repos as never, undefined, "space-1")
    ).resolves.toBe("kb-a");
    expect(repos.kb.list).toHaveBeenCalledWith({ spaceId: "space-1" });
  });

  it("never picks silently when the Space has several KBs", async () => {
    const repos = makeRepos({ list: async () => [kbB, kbA] });
    await expect(
      resolveKbIdForScopedRead(repos as never, undefined, "space-1")
    ).resolves.toBeNull();
  });

  it("returns null when the scope is empty", async () => {
    const repos = makeRepos({});
    await expect(resolveKbIdForScopedRead(repos as never)).resolves.toBeNull();
  });

  it("refuses an explicit KB that belongs to another Space", async () => {
    const repos = makeRepos({
      getById: async () => ({ ...kbA, space_id: "space-other" }),
    });
    await expect(
      resolveKbIdForScopedRead(repos as never, "kb-a", "space-1")
    ).resolves.toBeNull();
  });
});

describe("kbTargetRequired", () => {
  it("lists the candidates with links when kb_id is missing", async () => {
    const repos = makeRepos({ list: async () => [kbA, kbB] });
    const result = await kbTargetRequired(repos as never, "space-1");
    expect(result.error).toBe("kb_id_required");
    expect(result.knowledge_bases.map((kb) => kb.id)).toEqual(["kb-a", "kb-b"]);
    expect(result.knowledge_bases[0]?.link).toBe("/s/brain/kb");
  });

  it("says so when the Space has no KB", async () => {
    const repos = makeRepos({});
    const result = await kbTargetRequired(repos as never, "space-1");
    expect(result.error).toBe("no_knowledge_bases");
  });

  it("reports an explicit id that is not in the Space", async () => {
    const repos = makeRepos({ list: async () => [kbA] });
    const result = await kbTargetRequired(repos as never, "space-1", "kb-x");
    expect(result.error).toBe("kb_not_found");
    expect(result.knowledge_bases).toHaveLength(1);
  });
});
