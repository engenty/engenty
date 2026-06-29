import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatPluginList,
  mergePlugins,
  registerPluginCommands,
} from "./plugin-commands.js";

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

  it("formats merged plugin list output", () => {
    const output = formatPluginList(
      mergePlugins(
        [
          { slug: "contacts", onDisk: true, enabled: true, hasUi: true },
          { slug: "leads", onDisk: true, enabled: false, hasUi: false },
        ],
        [
          {
            enabled: true,
            id: "contacts",
            loaded: true,
            packageName: "@engenty/contacts",
            sourceType: "module",
            version: "1.0.0",
          },
        ]
      )
    );
    // Live state present → enriched columns appear.
    expect(output).toContain("STATUS");
    expect(output).toContain("contacts");
    expect(output).toContain("enabled");
    expect(output).toContain("1.0.0");
    expect(output).toContain("leads");
  });

  it("formats disk-only plugin list when no live state is available", () => {
    const output = formatPluginList(
      mergePlugins([
        { slug: "contacts", onDisk: true, enabled: true, hasUi: true },
      ])
    );
    expect(output).toContain("PLUGIN");
    expect(output).not.toContain("STATUS");
    expect(output).toContain("contacts");
  });

  it("maps plugins list to the tenant-aware API endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: [
            {
              enabled: true,
              id: "contacts",
              loaded: true,
              packageName: "@engenty/contacts",
              sourceType: "module",
              version: "1.0.0",
            },
          ],
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
          "plugins",
          "list",
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
      "http://core.local/api/plugins?tenantId=tenant-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer token-1",
        }),
        method: "GET",
      })
    );
    expect(logs.join("\n")).toContain("contacts");
  });

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

  it("maps plugin install to package lifecycle dry-run by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "plugin.install.blocked",
            message: "Plugin package install blocked: @engenty/leads",
            details: {
              executionAvailable: true,
              issues: [
                {
                  code: "plugin.install.package_mutation_deferred",
                  level: "warn",
                  message: "Package install requires confirmation.",
                },
              ],
              mutationPlan: {
                executionMode: "requires_confirmation",
                packageManager: "pnpm",
                packageSpec: "@engenty/leads",
              },
              nextSteps: ["Retry with --confirm-package-mutation."],
              operation: "install",
              pluginId: "@engenty/leads",
              status: "blocked",
            },
          },
        }),
        {
          status: 409,
          headers: { "content-type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const logs = await captureLogs(async () => {
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

    expect(fetchMock).toHaveBeenCalledWith(
      "http://core.local/api/plugins/%40engenty%2Fleads/install",
      expect.objectContaining({
        body: JSON.stringify({
          confirm_package_mutation: false,
          package_spec: "@engenty/leads",
        }),
        method: "POST",
      })
    );
    expect(logs.join("\n")).toContain("install blocked");
    expect(logs.join("\n")).toContain("requires_confirmation");
  });

  it("exposes plugins create flags in help", async () => {
    const outs: string[] = [];
    const program = new Command();
    program.exitOverride();
    program.configureOutput({
      writeErr: () => undefined,
      writeOut: (s) => {
        outs.push(String(s));
      },
    });
    registerPluginCommands(program);
    await expect(
      program.parseAsync(["plugins", "create", "--help"], { from: "user" })
    ).rejects.toMatchObject({ code: "commander.helpDisplayed" });
    const help = outs.join("\n");
    expect(help).toContain("--yes");
    expect(help).toContain("--display-name");
    expect(help).toContain("--ui-load");
    expect(help).toContain("--no-ui");
    expect(help).toContain("--no-server-routes");
  });
});
