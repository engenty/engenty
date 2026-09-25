import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import {
  armLoopbackForward,
  type CallbackRequest,
  loopbackCallbackPort,
} from "../loopback-forward.js";

// The forward replays one browser navigation inside the Space's computer.
// Ways it can fail: it replays something that is not the CLI's callback (a
// page's script, another local port, a second hit) — a web page then reaches
// processes on the computer; it alters the callback so the CLI rejects the
// code; or it renders the CLI's reply as HTML in the browser holding the
// Space's logins.

function fakePage() {
  const events = new EventEmitter();
  const page = {
    content: "",
    off: (event: string, fn: (r: CallbackRequest) => void) =>
      events.off(event, fn),
    on: (event: string, fn: (r: CallbackRequest) => void) =>
      events.on(event, fn),
    setContent: async (html: string) => {
      page.content = html;
    },
  };
  const navigate = (url: string, opts?: { method?: string; nav?: boolean }) => {
    const request: CallbackRequest = {
      isNavigationRequest: () => opts?.nav ?? true,
      method: () => opts?.method ?? "GET",
      url: () => url,
    };
    events.emit("request", request);
    events.emit("requestfailed", request);
  };
  return { navigate, page };
}

const CALLBACK = "http://127.0.0.1:53682/callback?code=abc%2F1&state=x";

describe("loopbackCallbackPort", () => {
  it("reads the port from the redirect the sign-in URL carries", () => {
    const url = `https://acme.example/auth?client_id=cli&redirect_uri=${encodeURIComponent("http://127.0.0.1:53682/callback")}`;
    expect(loopbackCallbackPort(url)).toBe(53_682);
    expect(
      loopbackCallbackPort(
        "https://acme.example/auth?next=https://acme.example:8443/x"
      )
    ).toBeNull();
  });
});

describe("armLoopbackForward", () => {
  it("replays only the callback's navigation, once, unaltered", async () => {
    const { navigate, page } = fakePage();
    const forward = vi.fn(async () => ({ status: 200, text: "ok" }));
    const armed = armLoopbackForward({ forward, page, port: 53_682 });

    navigate("http://127.0.0.1:9222/json/version");
    navigate("https://acme.example/callback?code=abc");
    navigate("http://127.0.0.1:53682/steal", { nav: false });
    navigate("http://127.0.0.1:53682/steal", { method: "POST" });
    navigate(CALLBACK);
    navigate("http://127.0.0.1:53682/second");

    expect(await armed.settle()).toEqual({ delivered: true, status: 200 });
    expect(forward.mock.calls).toEqual([[CALLBACK]]);
  });

  it("forwards nothing once disarmed", async () => {
    const { navigate, page } = fakePage();
    const forward = vi.fn(async () => ({ status: 200, text: "" }));
    const armed = armLoopbackForward({ forward, page, port: 53_682 });
    armed.disarm();
    navigate(CALLBACK);
    expect(await armed.settle()).toBeNull();
    expect(forward).not.toHaveBeenCalled();
  });

  it("shows the CLI's reply as text, and a refused callback as not delivered", async () => {
    const shown = fakePage();
    const armed = armLoopbackForward({
      forward: async () => ({
        status: 200,
        text: '<h1>Logged in</h1><script>fetch("https://evil.example")</script>',
      }),
      page: shown.page,
      port: 53_682,
    });
    shown.navigate(CALLBACK);
    await armed.settle();
    expect(shown.page.content).toContain("Logged in");
    expect(shown.page.content).not.toContain("<script");
    expect(shown.page.content).not.toContain("<h1>Logged");

    const refused = fakePage();
    const failing = armLoopbackForward({
      forward: async () => ({
        error: "Connection refused",
        status: null,
        text: "",
      }),
      page: refused.page,
      port: 53_682,
    });
    refused.navigate(CALLBACK);
    expect(await failing.settle()).toEqual({
      delivered: false,
      error: "Connection refused",
      status: null,
    });
  });
});
