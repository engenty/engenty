import { afterEach, describe, expect, it, vi } from "vitest";
import { matchesConnectRequestOutput } from "./components/copilot/connect-tool-call-card.js";
import {
  CONNECT_COMPLETE_MESSAGE_TYPE,
  parseConnectCompleteSearch,
  readConnectCompleteMessage,
} from "./connect-popup.js";

describe("matchesConnectRequestOutput", () => {
  const payload = {
    accounts: [],
    configured: true,
    connected: false,
    connector: {
      id: "google-calendar",
      name: "Google Calendar",
      icon: null,
      auth_kind: "oauth2",
    },
  };

  it("matches the bare op payload", () => {
    expect(
      matchesConnectRequestOutput({
        toolName: "connections_request_connect",
        output: payload,
      })
    ).toBe(true);
  });

  it("matches the chat-run {ok, data} envelope via resolved tool name", () => {
    expect(
      matchesConnectRequestOutput({
        toolName: "engenty_tool_execute",
        resolvedToolName: "connections_request_connect",
        output: { ok: true, data: payload },
      })
    ).toBe(true);
  });

  it("rejects other tools and malformed output", () => {
    expect(
      matchesConnectRequestOutput({
        toolName: "connections_catalog",
        output: payload,
      })
    ).toBe(false);
    expect(
      matchesConnectRequestOutput({
        toolName: "connections_request_connect",
        output: { ok: true },
      })
    ).toBe(false);
  });
});

const ORIGIN = "https://app.engenty.localhost";

describe("parseConnectCompleteSearch", () => {
  it("reads a successful callback", () => {
    expect(parseConnectCompleteSearch("?connected=1&connector=google")).toEqual(
      { connectorId: "google", error: null, ok: true }
    );
  });

  it("reads an error callback", () => {
    expect(
      parseConnectCompleteSearch("?error=access_denied&connector=google")
    ).toEqual({ connectorId: "google", error: "access_denied", ok: false });
  });

  it("treats missing params as failure", () => {
    expect(parseConnectCompleteSearch("")).toEqual({
      connectorId: null,
      error: null,
      ok: false,
    });
  });
});

describe("readConnectCompleteMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubWindow = () => {
    vi.stubGlobal("window", { location: { origin: ORIGIN } });
  };

  it("accepts a same-origin completion message", () => {
    stubWindow();
    expect(
      readConnectCompleteMessage({
        data: {
          connectorId: "google",
          error: null,
          ok: true,
          type: CONNECT_COMPLETE_MESSAGE_TYPE,
        },
        origin: ORIGIN,
      })
    ).toEqual({
      connectorId: "google",
      error: null,
      ok: true,
      type: CONNECT_COMPLETE_MESSAGE_TYPE,
    });
  });

  it("rejects cross-origin messages", () => {
    stubWindow();
    expect(
      readConnectCompleteMessage({
        data: { ok: true, type: CONNECT_COMPLETE_MESSAGE_TYPE },
        origin: "https://evil.example",
      })
    ).toBeNull();
  });

  it("rejects unrelated message payloads", () => {
    stubWindow();
    expect(
      readConnectCompleteMessage({ data: { type: "other" }, origin: ORIGIN })
    ).toBeNull();
    expect(
      readConnectCompleteMessage({ data: null, origin: ORIGIN })
    ).toBeNull();
  });
});
