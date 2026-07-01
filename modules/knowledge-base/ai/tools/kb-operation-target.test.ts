import { describe, expect, it, vi } from "vitest";
import { resolveKbIdForScopedRead } from "./kb-operation-target.js";

const kbA = {
  id: "kb-a",
  name: "Fundings",
  slug: "fundings",
  tenant_id: "t1",
  scope_id: "default",
  description: null,
  is_default: false,
  created_at: "",
  updated_at: "",
  created_by: null,
  deleted_at: null,
  article_property_definitions: [],
  cover: null,
  cover_inheritance: "none",
  icon: null,
};

const kbB = {
  ...kbA,
  id: "kb-b",
  name: "Internal",
  slug: "internal",
  is_default: false,
};

function makeRepos(overrides: {
  list?: () => Promise<(typeof kbA)[]>;
  getDefault?: () => Promise<typeof kbA | null>;
  getById?: (id: string) => Promise<typeof kbA | null>;
}) {
  return {
    kb: {
      list: vi.fn(overrides.list ?? (async () => [])),
      getDefault: vi.fn(overrides.getDefault ?? (async () => null)),
      getById: vi.fn(overrides.getById ?? (async () => null)),
    },
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

  it("falls back to default then first KB", async () => {
    const repos = makeRepos({
      getDefault: async () => null,
      list: async () => [kbB, kbA],
    });
    await expect(resolveKbIdForScopedRead(repos as never)).resolves.toBe(
      "kb-b"
    );
  });

  it("returns null when there is no default KB and the list is empty", async () => {
    const repos = makeRepos({});
    await expect(resolveKbIdForScopedRead(repos as never)).resolves.toBeNull();
  });
});
