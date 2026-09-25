import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerPluginCommands } from "./plugin-commands.js";

function createProgram() {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeErr: () => undefined,
    writeOut: () => undefined,
  });
  registerPluginCommands(program);
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

describe("plugin CLI commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Without tenant_id the server activates the plugin on the caller's own tenant.
  it("maps plugin activation to tenant_id request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            enabled: true,
            pluginId: "contacts",
            restartRequired: false,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await captureLogs(async () => {
      await createProgram().parseAsync(
        [
          "plugins",
          "activate",
          "contacts",
          "--api-url",
          "http://core.local",
          "--token",
          "token-1",
          "--tenant",
          "tenant-1",
        ],
        { from: "user" }
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://core.local/api/plugins/contacts/activate",
      expect.objectContaining({
        body: JSON.stringify({ tenant_id: "tenant-1" }),
        method: "POST",
      })
    );
  });

  it("asks for a package-install dry run unless confirmation is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await captureLogs(async () => {
      await createProgram().parseAsync(
        [
          "plugins",
          "install",
          "@engenty/leads",
          "--api-url",
          "http://core.local",
          "--token",
          "token-1",
        ],
        { from: "user" }
      );
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      confirm_package_mutation: false,
    });
  });
});
