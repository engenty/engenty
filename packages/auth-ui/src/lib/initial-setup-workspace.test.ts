import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureFirstSpace,
  firstSpaceKey,
  mountsToSetupPayload,
  namePersonalSpace,
  readPersonalSpace,
  slugifyName,
} from "./initial-setup-workspace";

interface Call {
  body: unknown;
  method: string;
  path: string;
}

/** A fake core: answers by path, records every write. */
function stubApi(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, "http://core").pathname;
      calls.push({
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        method: init?.method ?? "GET",
        path,
      });
      const key = `${init?.method ?? "GET"} ${path}`;
      const answer = answers[key] ?? answers[path] ?? {};
      return new Response(JSON.stringify({ data: answer }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    })
  );
  return calls;
}

const company = {
  id: "s1",
  isDefault: true,
  key: "company",
  name: "Company",
  ownerUserId: null,
};
const personal = {
  id: "s2",
  isDefault: false,
  key: "u-jane",
  name: "Jane",
  ownerUserId: "u1",
};

describe("slugifyName", () => {
  it("lowercases and hyphenates", () => {
    expect(slugifyName("Acme Inc.")).toBe("acme-inc");
  });

  it("drops leading and trailing separators", () => {
    expect(slugifyName("  — Acme — ")).toBe("acme");
  });

  it("is empty for a name with nothing sluggable in it", () => {
    expect(slugifyName("—")).toBe("");
  });

  // 48 is the column limit the tenant slug is stored under; a name cut mid-word
  // must not leave the trailing hyphen a slug may not end with.
  it("caps the length without ending on a hyphen", () => {
    const slug = slugifyName(`${"a".repeat(47)} b`);
    expect(slug).toHaveLength(47);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("mountsToSetupPayload", () => {
  it("renames the wire fields and keeps the whole set", () => {
    expect(
      mountsToSetupPayload([
        {
          agentAccess: "none",
          recordScope: "space",
          resourceKey: "engenty-copilot",
          resourceType: "module",
        },
        {
          agentAccess: null,
          recordScope: null,
          resourceKey: "engenty.copilot",
          resourceType: "agent",
        },
      ])
    ).toEqual([
      {
        agent_access: "none",
        record_scope: "space",
        resource_key: "engenty-copilot",
        resource_type: "module",
      },
      { resource_key: "engenty.copilot", resource_type: "agent" },
    ]);
  });
});

describe("firstSpaceKey", () => {
  it("keys the space off its name", () => {
    expect(firstSpaceKey("Acme Inc.", [])).toBe("acme-inc");
  });

  it("falls back when the name slugifies to nothing", () => {
    expect(firstSpaceKey("—", [])).toBe("space");
  });

  it("steps past a key the tenant already holds", () => {
    expect(firstSpaceKey("Acme", ["acme", "acme-2"])).toBe("acme-3");
  });

  // `spaces_key_format_check` caps the key at 63 characters.
  it("stays inside the key length limit", () => {
    expect(firstSpaceKey("a".repeat(80), []).length).toBeLessThanOrEqual(60);
  });
});

describe("ensureFirstSpace", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renames and re-keys the trigger-made default, echoing its mounts", async () => {
    const calls = stubApi({
      "/api/spaces": [company, personal],
      "/api/spaces/s1/mounts": [
        { resourceKey: "engenty-copilot", resourceType: "module" },
      ],
    });
    const result = await ensureFirstSpace({
      accessToken: "t",
      name: "Nordlicht Studio",
    });
    expect(result).toEqual({
      key: "nordlicht-studio",
      name: "Nordlicht Studio",
    });
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.path).toBe("/api/spaces/s1/setup");
    expect(put?.body).toEqual({
      key: "nordlicht-studio",
      mounts: [{ resource_key: "engenty-copilot", resource_type: "module" }],
      name: "Nordlicht Studio",
    });
  });

  it("creates the space when the tenant has no default", async () => {
    const calls = stubApi({
      "/api/spaces": [personal],
      "POST /api/spaces": { ...company, key: "acme", name: "Acme" },
    });
    const result = await ensureFirstSpace({ accessToken: "t", name: "Acme" });
    expect(result).toEqual({ key: "acme", name: "Acme" });
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({ key: "acme", name: "Acme" });
  });
});

describe("personal space", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("finds the space the admin owns", async () => {
    stubApi({ "/api/spaces": [company, personal] });
    expect(await readPersonalSpace({ accessToken: "t", userId: "u1" })).toEqual(
      { id: "s2", key: "u-jane", name: "Jane" }
    );
    expect(
      await readPersonalSpace({ accessToken: "t", userId: "nobody" })
    ).toBeNull();
  });

  it("renames without touching the key", async () => {
    const calls = stubApi({
      "/api/spaces/s2/mounts": [
        { resourceKey: "files", resourceType: "module", agentAccess: "write" },
      ],
    });
    await namePersonalSpace({
      accessToken: "t",
      name: "Jane's desk",
      spaceId: "s2",
    });
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.path).toBe("/api/spaces/s2/setup");
    expect(put?.body).toEqual({
      mounts: [
        {
          agent_access: "write",
          resource_key: "files",
          resource_type: "module",
        },
      ],
      name: "Jane's desk",
    });
  });
});
