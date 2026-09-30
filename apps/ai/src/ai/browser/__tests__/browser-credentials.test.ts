import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The page the agent's window shows, and what was typed into it.
const page = vi.hoisted(() => ({
  clicked: [] as string[],
  elements: {} as Record<string, { tag: string; type: string }>,
  typed: {} as Record<string, string>,
  url: "https://accounts.example.com/login",
}));

vi.mock("../user-browser-registry.js", () => ({
  browserWindowKey: () => "sandbox#maggie",
  ensureBrowserWindow: () => Promise.resolve(),
  getUserBrowser: () => ({
    getManagerForThread: () =>
      Promise.resolve({ getPage: () => ({ url: () => page.url }) }),
    requireLocator: (ref: string) =>
      Promise.resolve(
        page.elements[ref]
          ? {
              click: () => {
                page.clicked.push(ref);
                return Promise.resolve();
              },
              evaluate: (fn: (el: unknown) => unknown) =>
                Promise.resolve(
                  fn({
                    tagName: page.elements[ref]?.tag,
                    type: page.elements[ref]?.type,
                  })
                ),
              fill: (value: string) => {
                page.typed[ref] = value;
                return Promise.resolve();
              },
            }
          : null
      ),
  }),
  releaseUserSeat: () => undefined,
  takeUserSeat: () => undefined,
}));
vi.mock("../browser-show-tool.js", () => ({
  captureScreenshot: () =>
    Promise.resolve({
      preview: {
        annotations: [],
        height: 600,
        image: "data:image/jpeg;base64,AAAA",
        url: page.url,
        width: 800,
      },
      unresolved: [],
    }),
}));
vi.mock("../../../../ai/tools/engenty-tools/lib/run-context.js", () => ({
  getEngentyToolsRunContext: () => ({ canSuspendForInteraction: true }),
}));
vi.mock("../../../../ai/frontend-tools/frontend-tool-suspend-lock.js", () => ({
  acquireFrontendToolSuspendSlot: () => Promise.resolve(1),
  releaseFrontendToolSuspendSlot: () => undefined,
}));

import {
  createCredentialsRequestTool,
  fillBrowserCredentials,
  resetBrowserCredentialsForTests,
} from "../browser-credentials.js";

const identity = { agentId: "maggie", spaceId: "space-1", tenantId: "t-1" };
const SECRET = "hunter2-correct-horse";

interface Executable {
  execute: (input: unknown, ctx: unknown) => Promise<unknown>;
}

/** The agent asks; returns the request id the card carries. */
async function ask(): Promise<string> {
  const tool = createCredentialsRequestTool({
    identity,
    lockKey: () => "thread",
  }) as unknown as Executable;
  let payload: { preview?: { request_id?: string } } = {};
  await tool.execute(
    {
      fields: [
        { kind: "username", label: "Email", ref: "e1" },
        { kind: "password", label: "Password", ref: "e2" },
      ],
      reason: "Sign in to check the booking",
      submit_ref: "e3",
    },
    {
      agent: {
        suspend: (p: typeof payload) => {
          payload = p;
          return Promise.resolve();
        },
      },
    }
  );
  return payload.preview?.request_id ?? "";
}

async function resume(): Promise<unknown> {
  const tool = createCredentialsRequestTool({
    identity,
    lockKey: () => "thread",
  }) as unknown as Executable;
  return tool.execute(
    { fields: [], reason: "x" },
    { agent: { resumeData: { choice_id: "browser_credentials_filled" } } }
  );
}

describe("browser_request_credentials", () => {
  beforeEach(() => {
    page.url = "https://accounts.example.com/login";
    page.elements = {
      e1: { tag: "INPUT", type: "email" },
      e2: { tag: "INPUT", type: "password" },
      e3: { tag: "BUTTON", type: "submit" },
    };
    page.typed = {};
    page.clicked = [];
  });
  afterEach(() => resetBrowserCredentialsForTests());

  it("types the login into the page and tells the agent which fields — never the values", async () => {
    const requestId = await ask();
    const filled = await fillBrowserCredentials({
      requestId,
      spaceId: "space-1",
      tenantId: "t-1",
      values: { field_1: "me@example.com", field_2: SECRET },
    });
    expect(filled).toEqual({ filled: ["Email", "Password"], ok: true });
    expect(page.typed).toEqual({ e1: "me@example.com", e2: SECRET });
    expect(page.clicked).toEqual(["e3"]);

    const told = JSON.stringify(await resume());
    expect(told).toContain("Password");
    expect(told).not.toContain(SECRET);
    expect(told).not.toContain("me@example.com");
  });

  it("types nothing once the page has moved to another site", async () => {
    const requestId = await ask();
    page.url = "https://accounts.example.com.evil.test/login";
    const result = await fillBrowserCredentials({
      requestId,
      spaceId: "space-1",
      tenantId: "t-1",
      values: { field_2: SECRET },
    });
    expect(result).toEqual({ error: "origin_changed", ok: false });
    expect(page.typed).toEqual({});
  });

  it("puts a password only into a password input", async () => {
    const requestId = await ask();
    page.elements.e2 = { tag: "INPUT", type: "text" };
    const result = await fillBrowserCredentials({
      requestId,
      spaceId: "space-1",
      tenantId: "t-1",
      values: { field_2: SECRET },
    });
    expect(result).toEqual({ error: "not_a_password_field", ok: false });
    expect(page.typed).toEqual({});
  });

  it("cannot be answered from another Space", async () => {
    const requestId = await ask();
    const result = await fillBrowserCredentials({
      requestId,
      spaceId: "space-2",
      tenantId: "t-1",
      values: { field_2: SECRET },
    });
    expect(result).toEqual({ error: "not_found", ok: false });
    expect(page.typed).toEqual({});
  });

  it("tells the agent nothing was entered when the person declined", async () => {
    await ask();
    expect(String(await resume())).toContain("did not enter");
  });
});
