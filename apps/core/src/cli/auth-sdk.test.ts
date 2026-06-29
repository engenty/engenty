import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AuthSdkModule = typeof import("./auth-sdk.js");

function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "engenty-auth-sdk-test-"));
}

async function loadSdkWithHome(homeDir: string): Promise<AuthSdkModule> {
  vi.resetModules();
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  return await import("./auth-sdk.js");
}

describe("cli auth-sdk", () => {
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  let tempHomes: string[] = [];

  beforeEach(() => {
    tempHomes = [];
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    vi.unstubAllGlobals();
    for (const home of tempHomes) {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("stores session on device login and reads it back", async () => {
    const home = makeTempHome();
    tempHomes.push(home);
    const sdk = await loadSdkWithHome(home);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deviceCode: "dev-code-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "access-1",
            refreshToken: "refresh-1",
            expiresIn: 300,
            sessionId: "session-1",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const start = await sdk.startDeviceAuthorization({
      apiUrl: "http://127.0.0.1:8787",
      capabilities: ["module.read"],
    });
    expect(start.deviceCode).toBe("dev-code-1");
    const session = await sdk.pollDeviceToken({
      apiUrl: "http://127.0.0.1:8787",
      deviceCode: start.deviceCode,
      expiresIn: 600,
      intervalSeconds: 1,
      sleepImpl: () => Promise.resolve(),
    });
    expect(session.accessToken).toBe("access-1");
    expect(session.refreshToken).toBe("refresh-1");
    expect(session.sessionId).toBe("session-1");

    const stored = sdk.getStoredSession("http://127.0.0.1:8787");
    expect(stored?.accessToken).toBe("access-1");
    expect(stored?.refreshToken).toBe("refresh-1");

    sdk.clearStoredSession();
    expect(sdk.getStoredSession("http://127.0.0.1:8787")).toBeNull();
  });

  it("refreshes expiring token via exchange and persists new token", async () => {
    const home = makeTempHome();
    tempHomes.push(home);
    const sdk = await loadSdkWithHome(home);

    const authDir = path.join(home, ".engenty");
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(
      path.join(authDir, "auth.json"),
      JSON.stringify(
        {
          apiUrl: "http://127.0.0.1:8787",
          accessToken: "old-access",
          refreshToken: "old-refresh",
          expiresAt: Date.now() + 1000,
          sessionId: "session-1",
        },
        null,
        2
      ),
      "utf8"
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: "new-access",
          refreshToken: "new-refresh",
          expiresIn: 3600,
          sessionId: "session-1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await sdk.ensureAccessToken("http://127.0.0.1:8787");
    expect(token).toBe("new-access");

    const stored = sdk.getStoredSession("http://127.0.0.1:8787");
    expect(stored?.accessToken).toBe("new-access");
    expect(stored?.refreshToken).toBe("new-refresh");
  });

  it("retries request after 401 with refreshed token", async () => {
    const home = makeTempHome();
    tempHomes.push(home);
    const sdk = await loadSdkWithHome(home);

    const authDir = path.join(home, ".engenty");
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(
      path.join(authDir, "auth.json"),
      JSON.stringify(
        {
          apiUrl: "http://127.0.0.1:8787",
          accessToken: "old-access",
          refreshToken: "old-refresh",
          expiresAt: Date.now() + 1000,
          sessionId: "session-1",
        },
        null,
        2
      ),
      "utf8"
    );

    const fetchMock = vi
      .fn()
      // ensureAccessToken() exchange
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "new-access",
            refreshToken: "new-refresh",
            expiresIn: 3600,
            sessionId: "session-1",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      // first API call with token -> unauthorized
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      // forced refresh on 401
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: "newer-access",
            refreshToken: "newer-refresh",
            expiresIn: 3600,
            sessionId: "session-1",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
      // retry API call with refreshed token
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, value: "retried" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sdk.authenticatedJsonRequest<{
      ok: boolean;
      value: string;
    }>({
      apiUrl: "http://127.0.0.1:8787",
      endpoint: "/api/tools/contracts",
      method: "GET",
    });
    expect(result).toEqual({ ok: true, value: "retried" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
