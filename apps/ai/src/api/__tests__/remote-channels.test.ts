// Remote channels runtime (engenty-remote Phase 1) — registration smoke.
// Uses dummy Slack credentials: the Chat SDK adapter only validates shape at
// construction; requests are exercised against the mounted Hono routes, where
// the unsigned-request rejection proves signature verification is active.
import { Mastra } from "@mastra/core/mastra";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRemoteChannelsAgent,
  isRemoteChannelsEnabled,
  registerRemoteChannels,
} from "../remote-channels.js";

const ENV_KEYS = [
  "ENGENTY_REMOTE_CHANNELS_ENABLED",
  "ENGENTY_AI_SERVICE_JWT",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
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
  process.env.ENGENTY_AI_SERVICE_JWT = "dummy-service-jwt";
  process.env.SLACK_BOT_TOKEN = "xoxb-dummy";
  process.env.SLACK_SIGNING_SECRET = "dummy-signing-secret";
}

const WEBHOOK_PATH = "/api/agents/engenty.remote/channels/slack/webhook";

describe("remote channels registration", () => {
  it("is disabled by default (opt-in kill switch)", () => {
    delete process.env.ENGENTY_REMOTE_CHANNELS_ENABLED;
    expect(isRemoteChannelsEnabled()).toBe(false);
  });

  it("mounts no routes when disabled", async () => {
    delete process.env.ENGENTY_REMOTE_CHANNELS_ENABLED;
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
    expect(routes.map((r) => r.path)).toContain(WEBHOOK_PATH);
  });

  it("mounts the webhook route and rejects unsigned requests", async () => {
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
  });
});
