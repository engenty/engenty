// Remote channels runtime (engenty-remote Phase 1) — registration smoke.
// Uses dummy Slack credentials: the Chat SDK adapter only validates shape at
// construction; requests are exercised against the mounted Hono routes, where
// the unsigned-request rejection proves signature verification is active.
import { Mastra } from "@mastra/core/mastra";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRemoteChannelsAgent,
  extractExternalWorkspaceId,
  isRemoteChannelsEnabled,
  outboundPayloadSchema,
  parseChannelCommand,
  registerRemoteChannels,
} from "../remote-channels.js";

const ENV_KEYS = [
  "ENGENTY_REMOTE_CHANNELS_ENABLED",
  "ENGENTY_AI_SERVICE_SECRET",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "TELEGRAM_BOT_TOKEN",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function enableWithDummyCreds() {
  process.env.ENGENTY_REMOTE_CHANNELS_ENABLED = "true";
  process.env.ENGENTY_AI_SERVICE_SECRET = "cred-test.dummy-secret";
  process.env.SLACK_BOT_TOKEN = "xoxb-dummy";
  process.env.SLACK_SIGNING_SECRET = "dummy-signing-secret";
}

// What Mastra's getWebhookRoutes() emits (shaped for Mastra's own server) …
const MASTRA_ROUTE_PATH = "/api/agents/engenty.remote/channels/slack/webhook";
// … and where we actually mount it: under the /ai base path, so the webhook
// rides the core gateway like every other apps/ai route.
const WEBHOOK_PATH = `/ai${MASTRA_ROUTE_PATH}`;

describe("remote channels registration", () => {
  it("is on by default and off only when explicitly disabled", () => {
    delete process.env.ENGENTY_REMOTE_CHANNELS_ENABLED;
    expect(isRemoteChannelsEnabled()).toBe(true);
    process.env.ENGENTY_REMOTE_CHANNELS_ENABLED = "false";
    expect(isRemoteChannelsEnabled()).toBe(false);
  });

  it("mounts no routes when killed by the switch", async () => {
    enableWithDummyCreds();
    process.env.ENGENTY_REMOTE_CHANNELS_ENABLED = "false";
    const app = new Hono();
    await registerRemoteChannels(app as never, { mastra: new Mastra({}) });
    const res = await app.request(WEBHOOK_PATH, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("mounts no routes when no platform is configured", async () => {
    // The default state of every deployment that doesn't use remote channels:
    // switch untouched, no bot token. Nothing must be mounted.
    delete process.env.ENGENTY_REMOTE_CHANNELS_ENABLED;
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_SIGNING_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    const app = new Hono();
    await registerRemoteChannels(app as never, { mastra: new Mastra({}) });
    const res = await app.request(WEBHOOK_PATH, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("builds the channel-bound agent with a slack webhook route", () => {
    enableWithDummyCreds();
    const agent = createRemoteChannelsAgent();
    const channels = agent.getChannels();
    expect(channels).toBeTruthy();
    const routes = channels?.getWebhookRoutes() ?? [];
    expect(routes.map((r) => r.path)).toContain(MASTRA_ROUTE_PATH);
  });

  it("mounts the webhook route and rejects unsigned requests", async () => {
    // Heavyweight: this builds a real Mastra instance and mounts the
    // channel routes, which costs seconds. On a loaded machine the parallel
    // forks push it past the 10s global budget and it fails as a flake with
    // nothing actually wrong. Widened here rather than globally so a real
    // hang elsewhere still trips the default.
    enableWithDummyCreds();
    const app = new Hono();
    await registerRemoteChannels(app as never, { mastra: new Mastra({}) });
    const res = await app.request(WEBHOOK_PATH, {
      body: JSON.stringify({ challenge: "abc", type: "url_verification" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    // Not 404 (mounted) and not 2xx (unsigned request must be refused by the
    // adapter's signature verification).
    expect(res.status).not.toBe(404);
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Regression guard: the raw Mastra path must NOT be mounted. Unprefixed it
    // is shadowed by core's /api/* gateway rule and unreachable in deployments
    // — mounting it would silently revert to a dev-direct-access-only webhook.
    const unprefixed = await app.request(MASTRA_ROUTE_PATH, {
      body: JSON.stringify({ challenge: "abc", type: "url_verification" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(unprefixed.status).toBe(404);
  }, 30_000);
});

describe("parseChannelCommand", () => {
  it("parses the known control tokens", () => {
    expect(parseChannelCommand("/new")).toEqual({ kind: "new" });
    expect(parseChannelCommand("  /threads  ")).toEqual({ kind: "threads" });
    expect(parseChannelCommand("/HELP")).toEqual({ kind: "help" });
    expect(parseChannelCommand("/link abc-123")).toEqual({
      kind: "link",
      threadRef: "abc-123",
    });
  });

  it("passes everything else through to the agent", () => {
    // Only exact known tokens are commands — a pasted path, an emote, or a
    // typo must reach the agent, not vanish into a swallowed control.
    expect(parseChannelCommand("hello")).toBeNull();
    expect(parseChannelCommand("/shrug")).toBeNull();
    expect(parseChannelCommand("/newish thing")).toBeNull();
    expect(parseChannelCommand("/usr/local/bin")).toBeNull();
    expect(parseChannelCommand("")).toBeNull();
  });
});

describe("extractExternalWorkspaceId", () => {
  it("reads every Slack payload shape", () => {
    // Message events: team_id, or team as a string.
    expect(extractExternalWorkspaceId("slack", { team_id: "T-1" })).toBe("T-1");
    expect(extractExternalWorkspaceId("slack", { team: "T-2" })).toBe("T-2");
    // block_actions: team.id (object), user.team_id fallback.
    expect(extractExternalWorkspaceId("slack", { team: { id: "T-3" } })).toBe(
      "T-3"
    );
    expect(
      extractExternalWorkspaceId("slack", { user: { team_id: "T-4" } })
    ).toBe("T-4");
    // team_id wins over the fallbacks when several are present.
    expect(
      extractExternalWorkspaceId("slack", {
        team_id: "T-1",
        user: { team_id: "T-4" },
      })
    ).toBe("T-1");
  });

  it("returns null for junk, absence, and workspace-less platforms", () => {
    expect(extractExternalWorkspaceId("slack", null)).toBeNull();
    expect(extractExternalWorkspaceId("slack", undefined)).toBeNull();
    expect(extractExternalWorkspaceId("slack", "not-an-object")).toBeNull();
    expect(extractExternalWorkspaceId("slack", { team_id: "  " })).toBeNull();
    expect(extractExternalWorkspaceId("slack", { team_id: 42 })).toBeNull();
    // Telegram has no workspace concept — the bot token is the anchor.
    expect(
      extractExternalWorkspaceId("telegram", { team_id: "T-1" })
    ).toBeNull();
  });
});

describe("outbound payload contract", () => {
  const authorized = {
    binding_id: "binding-1",
    external_thread_id: "C-THREAD",
    platform: "slack",
    tenant_id: "tenant-a",
    text: "hello",
  };

  it("accepts a payload queued by remote_notify", () => {
    expect(outboundPayloadSchema.parse(authorized)).toMatchObject(authorized);
  });

  it("refuses a payload with no binding_id", () => {
    // remote_notify only sets binding_id after proving the thread belongs to
    // the calling tenant. No binding_id ⇒ that check never ran ⇒ the bot must
    // not post, or the destination authorization is bypassable by anything
    // that can write to the queue.
    const { binding_id: _dropped, ...noBinding } = authorized;
    expect(() => outboundPayloadSchema.parse(noBinding)).toThrow();
    expect(() =>
      outboundPayloadSchema.parse({ ...authorized, binding_id: "" })
    ).toThrow();
  });
});
