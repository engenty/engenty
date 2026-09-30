import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureFirstSpace,
  firstSpaceKey,
  hireFirstEngenty,
  mountsToSetupPayload,
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

const company = { id: "s1", isDefault: true, key: "company", name: "Company" };
const personal = { id: "s2", isDefault: false, key: "u-jane", name: "Jane" };
const baseline = [
  {
    agentAccess: "none" as const,
    resourceKey: "engenty-copilot",
    resourceType: "module",
  },
  { resourceKey: "engenty.copilot", resourceType: "agent" },
];

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

  it("makes the person its owner, then renames, re-keys and colours the default space, keeping its mounts", async () => {
    const calls = stubApi({
      "/api/spaces": [company, personal],
      "/api/spaces/s1/mounts": [
        { resourceKey: "engenty-copilot", resourceType: "module" },
        {
          agentAccess: "write",
          resourceKey: "contacts",
          resourceType: "module",
        },
        { resourceKey: "engenty.cli", resourceType: "agent" },
      ],
    });
    const result = await ensureFirstSpace({
      accessToken: "t",
      baseline,
      color: "#0d9488",
      icon: null,
      name: "Nordlicht Studio",
      userId: "u1",
      visibility: "private",
    });
    expect(result).toEqual({
      id: "s1",
      key: "nordlicht-studio",
      name: "Nordlicht Studio",
    });
    const puts = calls.filter((c) => c.method === "PUT");
    // Owner before private: the other order would shut the person out.
    expect(puts.map((c) => c.path)).toEqual([
      "/api/spaces/s1/members/u1",
      "/api/spaces/s1/setup",
    ]);
    expect(puts[0]?.body).toEqual({ role: "owner" });
    const put = puts[1];
    // PUT /setup replaces the whole set: what the space had must come along.
    expect(put?.body).toEqual({
      color: "#0d9488",
      icon: null,
      key: "nordlicht-studio",
      mounts: [
        {
          agent_access: "none",
          resource_key: "engenty-copilot",
          resource_type: "module",
        },
        { resource_key: "engenty.copilot", resource_type: "agent" },
        {
          agent_access: "write",
          resource_key: "contacts",
          resource_type: "module",
        },
        { resource_key: "engenty.cli", resource_type: "agent" },
      ],
      name: "Nordlicht Studio",
      visibility: "private",
    });
  });

  it("creates the space when the tenant has no default", async () => {
    const calls = stubApi({
      "/api/spaces": [personal],
      "POST /api/spaces": {
        space: { ...company, id: "s9", key: "acme", name: "Acme" },
      },
    });
    const result = await ensureFirstSpace({
      accessToken: "t",
      baseline,
      color: "#dc2626",
      icon: "🚀",
      name: "Acme",
      userId: "u1",
      visibility: "open",
    });
    expect(result).toEqual({ id: "s9", key: "acme", name: "Acme" });
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toMatchObject({
      color: "#dc2626",
      icon: "🚀",
      key: "acme",
      name: "Acme",
      visibility: "open",
    });
  });
});

describe("hireFirstEngenty", () => {
  afterEach(() => vi.unstubAllGlobals());

  const choice = {
    engenty: "drop" as const,
    job: "Keeps the space tidy.",
    name: "Mira",
  };

  it("fails when the engenty was created but not mounted into the space", async () => {
    stubApi({
      "POST /ai/registry/agents": {
        mounted: [{ error: "space full", ok: false, spaceId: "s1" }],
      },
    });
    await expect(
      hireFirstEngenty({
        accessToken: "t",
        choice,
        language: "de",
        space: { id: "s1", name: "Acme" },
      })
    ).rejects.toThrow("space full");
  });

  it("hires the person's name, face and job into the space", async () => {
    const calls = stubApi({
      "POST /ai/registry/agents": { mounted: [{ ok: true, spaceId: "s1" }] },
    });
    expect(
      await hireFirstEngenty({
        accessToken: "t",
        choice,
        language: "de",
        space: { id: "s1", name: "Acme" },
      })
    ).toEqual({ id: "mira", name: "Mira" });
    expect(calls[0]?.body).toMatchObject({
      description: "Keeps the space tidy.",
      engenty: "drop",
      name: "Mira",
      spaceIds: ["s1"],
    });
  });
});
