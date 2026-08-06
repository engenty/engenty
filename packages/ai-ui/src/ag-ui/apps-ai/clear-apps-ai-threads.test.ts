/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAppsAiThreadsForHost } from "./apps-ai-thread-api.js";

vi.mock("./apps-ai-api.js", () => ({
  appsAiRequestHeaders: vi.fn(async () => ({
    Authorization: "Bearer test",
    "content-type": "application/json",
  })),
  appsAiThreadsPath: (base: string) => `${base}/ai/threads`,
  withAppsAiSearchParams: (href: string, search: URLSearchParams) =>
    search.size > 0 ? `${href}?${search.toString()}` : href,
}));

describe("clearAppsAiThreadsForHost", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("deletes cached thread ids, bulk agent cleanup, and verifies empty list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, text: async () => '{"deleted":1}' })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ sessions: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await clearAppsAiThreadsForHost({
      agentId: "engenty.copilot",
      hostKey: "engenty:copilot",
      serviceBaseUrl: "https://engenty.localhost",
      threadIds: ["11111111-1111-4111-8111-111111111111"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/11111111-1111-4111-8111-111111111111"
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "agent_id=engenty.copilot"
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain("host_key=");
  });

  it("throws when sessions remain after delete", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, text: async () => '{"deleted":0}' })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            sessions: [{ id: "22222222-2222-4222-8222-222222222222" }],
          }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      clearAppsAiThreadsForHost({
        agentId: "engenty.copilot",
        hostKey: "engenty:copilot",
        serviceBaseUrl: "https://engenty.localhost",
        threadIds: ["11111111-1111-4111-8111-111111111111"],
      })
    ).rejects.toThrow(/left 1 session/);
  });
});
