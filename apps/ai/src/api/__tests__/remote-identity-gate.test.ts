// Identity gate (engenty-remote Phase 2) — unit tests over the ChannelHandler.
// Global fetch is stubbed to serve both the gateway-op invoke (sender
// resolution) and the core actor-token mint, so the gate's three paths are
// exercised without a running core: unmapped+invite → pairing link posted,
// unmapped+deny → refusal posted, mapped → default handler runs inside the
// engenty-tools ALS scope carrying the delegated actor token.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import { createIdentityGateHandler } from "../remote-channels.js";

const ENV_KEYS = ["ENGENTY_AI_SERVICE_JWT", "PUBLIC_APP_URL"] as const;
let savedEnv: Record<string, string | undefined>;

interface FakeScenario {
  binding: Record<string, unknown> | null;
  /** Defaults to true — set false to simulate a replayed platform event. */
  fresh?: boolean;
  identity: Record<string, unknown> | null;
  pairing_code: string | null;
}

function stubFetch(scenario: FakeScenario) {
  const calls: Array<{ body: unknown; url: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ body, url });
      if (url.includes("/api/tools/remote_runtime_resolve_sender/invoke")) {
        return Response.json({
          data: {
            binding: scenario.binding,
            conversation: scenario.binding
              ? { ai_thread_id: null, id: "conv-1" }
              : null,
            fresh: scenario.fresh ?? true,
            identity: scenario.identity,
            ok: true,
            pairing_code: scenario.pairing_code,
          },
          ok: true,
        });
      }
      if (url.includes("/api/auth/actor-token")) {
        return Response.json({
          expires_in: 300,
          ok: true,
          token: "actor-tok-123",
        });
      }
      return new Response("not found", { status: 404 });
    })
  );
  return calls;
}

function fakeThread() {
  const posts: string[] = [];
  return {
    adapterName: "slack",
    post: async (text: string) => {
      posts.push(text);
      return {} as never;
    },
    posts,
  };
}

const senderMessage = {
  author: {
    fullName: "External Erin",
    isBot: false,
    isMe: false,
    userId: "U-EXT-1",
    userName: "erin",
  },
  // Platform raw payload (Chat SDK escape hatch) — carries the Slack
  // workspace id the gate must forward for workspace-anchored binding
  // resolution.
  raw: { team_id: "T-WORKSPACE-1", type: "message" },
} as never;

const activeBinding = {
  agent_id: "engenty.remote",
  id: "b-1",
  platform: "slack",
  status: "active",
  tenant_id: "t-1",
  unmapped_sender_policy: "invite",
};

describe("remote identity gate", () => {
  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    process.env.ENGENTY_AI_SERVICE_JWT = "service-jwt";
    process.env.PUBLIC_APP_URL = "https://app.example.com";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("posts a pairing link for unmapped senders under the invite policy", async () => {
    stubFetch({
      binding: activeBinding,
      identity: null,
      pairing_code: "CODE123",
    });
    const gate = createIdentityGateHandler();
    const thread = fakeThread();
    const ran = vi.fn();
    await gate(thread as never, senderMessage, ran);
    expect(ran).not.toHaveBeenCalled();
    expect(thread.posts).toHaveLength(1);
    expect(thread.posts[0]).toContain(
      "https://app.example.com/mdl/engenty-remote/pair?code=CODE123"
    );
  });

  it("refuses unmapped senders under the deny policy", async () => {
    stubFetch({
      binding: { ...activeBinding, unmapped_sender_policy: "deny" },
      identity: null,
      pairing_code: null,
    });
    const gate = createIdentityGateHandler();
    const thread = fakeThread();
    const ran = vi.fn();
    await gate(thread as never, senderMessage, ran);
    expect(ran).not.toHaveBeenCalled();
    expect(thread.posts).toHaveLength(1);
    expect(thread.posts[0]).toMatch(/linked engenty users/);
  });

  it("stays silent for unmapped senders under the ignore policy and without a binding", async () => {
    stubFetch({
      binding: { ...activeBinding, unmapped_sender_policy: "ignore" },
      identity: null,
      pairing_code: null,
    });
    const gate = createIdentityGateHandler();
    const thread = fakeThread();
    await gate(thread as never, senderMessage, vi.fn());
    expect(thread.posts).toHaveLength(0);

    stubFetch({ binding: null, identity: null, pairing_code: null });
    const thread2 = fakeThread();
    await gate(thread2 as never, senderMessage, vi.fn());
    expect(thread2.posts).toHaveLength(0);
  });

  it("runs mapped senders inside the ALS scope with the delegated actor token", async () => {
    const calls = stubFetch({
      binding: activeBinding,
      identity: { user_id: "user-42" },
      pairing_code: null,
    });
    const gate = createIdentityGateHandler();
    const thread = fakeThread();
    let observed: ReturnType<typeof getEngentyToolsRunContext> | null = null;
    await gate(thread as never, senderMessage, async () => {
      observed = getEngentyToolsRunContext();
    });
    expect(observed).not.toBeNull();
    expect(observed!.userId).toBe("user-42");
    expect(observed!.tenantId).toBe("t-1");
    expect(observed!.userAccessToken).toBe("actor-tok-123");
    // "defer", not "suspend": suspension renders no card in channel threads
    // (no tool-call-approval chunk) and parks in-process — verified live.
    // Core records a durable approval request and the turn ends with a reply.
    expect(observed!.approvalPolicy).toBe("defer");
    const mint = calls.find((c) => c.url.includes("/api/auth/actor-token"));
    expect(mint?.body).toMatchObject({ tenant_id: "t-1", user_id: "user-42" });

    // Workspace routing: the raw payload's team id must reach the resolve op —
    // without it a workspace-anchored binding can never match, and two tenants
    // bound to the same platform are unroutable (the server refuses to guess).
    const resolve = calls.find((c) =>
      c.url.includes("/api/tools/remote_runtime_resolve_sender/invoke")
    );
    expect(resolve?.body).toMatchObject({
      input: { external_workspace_id: "T-WORKSPACE-1" },
    });
  });

  it("drops replayed events (durable dedup) without posting or running", async () => {
    // fresh:false = the op already saw this platform event id — a webhook
    // retry, or a redelivery after a restart that emptied Chat SDK's
    // in-memory dedup. Nothing may happen: no reply, no pairing, no run.
    stubFetch({
      binding: activeBinding,
      fresh: false,
      identity: { user_id: "user-42" },
      pairing_code: null,
    });
    const gate = createIdentityGateHandler();
    const thread = fakeThread();
    const ran = vi.fn();
    await gate(thread as never, senderMessage, ran);
    expect(ran).not.toHaveBeenCalled();
    expect(thread.posts).toHaveLength(0);
  });
});
