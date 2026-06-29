import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerModuleOperationCommands } from "./commands.js";

function createProgram() {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeErr: () => undefined,
    writeOut: () => undefined,
  });
  registerModuleOperationCommands(program);
  return program;
}

async function captureLogs(run: () => Promise<void>) {
  const logs: string[] = [];
  const log = console.log;
  console.log = (message?: unknown) => {
    logs.push(String(message ?? ""));
  };
  try {
    await run();
  } finally {
    console.log = log;
  }
  return logs;
}

describe("module tool CLI commands", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists global tool contracts through the tools endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: [{ toolId: "contacts_list" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const logs = await captureLogs(async () => {
      await createProgram().parseAsync(
        [
          "modules",
          "tools",
          "list",
          "--api-url",
          "http://core.local",
          "--token",
          "token-1",
        ],
        { from: "user" }
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://core.local/api/tools/contracts",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer token-1",
        }),
        method: "GET",
      })
    );
    expect(logs.join("\n")).toContain("contacts_list");
  });

  it("invokes module-scoped tools through the tools endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { id: "c1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await captureLogs(async () => {
      await createProgram().parseAsync(
        [
          "modules",
          "tools",
          "invoke",
          "--tool",
          "contacts_get",
          "--module",
          "contacts",
          "--input",
          '{"id":"c1"}',
          "--api-url",
          "http://core.local",
          "--token",
          "token-1",
        ],
        { from: "user" }
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://core.local/api/contacts/tools/contacts_get/invoke",
      expect.objectContaining({
        body: JSON.stringify({ input: { id: "c1" } }),
        method: "POST",
      })
    );
  });
});
