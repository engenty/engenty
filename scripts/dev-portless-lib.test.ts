import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildPortlessEntries } from "./dev-env-urls.mjs";
import {
  buildGatewayEnvExports,
  buildPortlessRouteName,
  buildPortlessRouteNames,
  portsForSlot,
  readSlotRegistry,
  resolveDevDomain,
  resolveDevPorts,
  rewriteDevGatewayLocation,
  sanitizeDomain,
  slotRegistryPath,
  writeSlotRegistry,
} from "./dev-portless-lib.mjs";

describe("dev-portless-lib", () => {
  const tempDirs = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function tempWorkspace() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-dev-portless-"));
    tempDirs.push(dir);
    return dir;
  }

  it("sanitizeDomain normalizes unsafe input", () => {
    expect(sanitizeDomain("Tab-UI")).toBe("tab-ui");
    expect(sanitizeDomain("fix/tab_ui")).toBe("fix-tab-ui");
    expect(sanitizeDomain("---")).toBe(null);
  });

  it("resolveDevDomain prefers explicit --domain", () => {
    expect(
      resolveDevDomain({
        explicitDomain: "my-task",
        cwd: "/tmp/engenty-pro",
      })
    ).toBe("my-task");
  });

  it("resolveDevDomain uses basename in linked worktrees", () => {
    expect(
      resolveDevDomain({
        cwd: "/tmp/engenty-pro-tab-ui",
        basename: "engenty-pro-tab-ui",
        worktreeCount: 2,
      })
    ).toBe("engenty-pro-tab-ui");
  });

  it("resolveDevDomain treats engenty-pro basename as main", () => {
    expect(
      resolveDevDomain({
        cwd: "/code/engenty/engenty-pro",
        basename: "engenty-pro",
      })
    ).toBe(null);
  });

  it("portsForSlot increments by step", () => {
    expect(portsForSlot(0).ui).toBe(5173);
    expect(portsForSlot(1).ui).toBe(5183);
    expect(portsForSlot(1).core).toBe(8797);
    expect(portsForSlot(1).studio).toBe(43_121);
  });

  it("buildPortlessRouteName prefixes domain", () => {
    expect(buildPortlessRouteName("engenty", null)).toBe("engenty");
    expect(buildPortlessRouteName("engenty", "tab-ui")).toBe("tab-ui.engenty");
    expect(buildPortlessRouteName("ai.engenty", "tab-ui")).toBe(
      "tab-ui.ai.engenty"
    );
  });

  it("buildPortlessRouteNames builds HTTPS origins", () => {
    const routes = buildPortlessRouteNames({
      coreName: "engenty",
      aiName: "ai.engenty",
      docsName: "docs.engenty",
      domain: "tab-ui",
    });
    expect(routes.gateway).toBe("tab-ui.engenty");
    expect(routes.gatewayOrigin).toBe("https://tab-ui.engenty.localhost");
    expect(routes.aiOrigin).toBe("https://tab-ui.ai.engenty.localhost");
  });

  it("resolveDevPorts persists slot registry per domain", () => {
    const workspaceRoot = tempWorkspace();
    const registryPath = slotRegistryPath(workspaceRoot);

    const first = resolveDevPorts({
      domain: "tab-ui",
      workspaceRoot,
      persist: true,
    });
    const second = resolveDevPorts({
      domain: "tab-ui",
      workspaceRoot,
      persist: true,
    });

    expect(first.slot).toBe(1);
    expect(first.ports.ui).toBe(5183);
    expect(second.ports).toEqual(first.ports);
    expect(readSlotRegistry(registryPath).domains["tab-ui"].slot).toBe(1);
  });

  it("resolveDevPorts slot 0 for main checkout", () => {
    const workspaceRoot = tempWorkspace();
    const main = resolveDevPorts({
      domain: null,
      workspaceRoot,
      persist: true,
    });
    expect(main.slot).toBe(0);
    expect(main.ports.core).toBe(8787);
  });

  it("buildGatewayEnvExports omits studio env for worktrees", () => {
    const env = buildGatewayEnvExports(portsForSlot(1), {
      includeStudio: false,
    });
    expect(env.ENGENTY_UI_PORT).toBe("5183");
    expect(env.ENGENTY_STUDIO_PORT).toBeUndefined();
    expect(env.ENGENTY_DEV_GATEWAY_STUDIO_URL).toBeUndefined();
  });

  it("buildGatewayEnvExports maps loopback upstream URLs", () => {
    const env = buildGatewayEnvExports(portsForSlot(1));
    expect(env.ENGENTY_UI_PORT).toBe("5183");
    expect(env.ENGENTY_DEV_GATEWAY_UI_URL).toBe("http://127.0.0.1:5183");
    expect(env.ENGENTY_DEV_GATEWAY_STUDIO_URL).toBe("http://127.0.0.1:43121");
  });

  it("rewriteDevGatewayLocation uses worktree gateway origin", () => {
    const gateway = "https://tab-ui.engenty.localhost";
    const docsDirect = "https://tab-ui.docs.engenty.localhost";
    expect(
      rewriteDevGatewayLocation(`${docsDirect}/some/path`, gateway, docsDirect)
    ).toBe(`${gateway}/some/path`);
    expect(
      rewriteDevGatewayLocation(
        "https://manage.engenty.localhost/login",
        gateway,
        docsDirect
      )
    ).toBe(`${gateway}/manage/login`);
  });

  it("buildPortlessEntries includes worktree domain in URLs", () => {
    const entries = buildPortlessEntries({
      coreName: "engenty",
      aiName: "ai.engenty",
      domain: "tab-ui",
    });
    expect(entries.ENGENTY_UI_BASE_URL).toBe(
      "https://tab-ui.engenty.localhost"
    );
    expect(entries.ENGENTY_AI_BASE_URL).toBe(
      "https://tab-ui.ai.engenty.localhost"
    );
    expect(entries.ENGENTY_DEV_DOMAIN).toBe("tab-ui");
    expect(entries.ENGENTY_CORE_BASE_URL).toBe("http://127.0.0.1:8787");
    expect(entries.ENGENTY_CORS_ORIGINS).toContain(
      "https://tab-ui.engenty.localhost"
    );
  });

  it("writeSlotRegistry round-trips", () => {
    const workspaceRoot = tempWorkspace();
    const registryPath = slotRegistryPath(workspaceRoot);
    writeSlotRegistry(registryPath, {
      domains: {
        foo: { slot: 2, ports: portsForSlot(2) },
      },
      nextSlot: 3,
    });
    const loaded = readSlotRegistry(registryPath);
    expect(loaded.nextSlot).toBe(3);
    expect(loaded.domains.foo.slot).toBe(2);
  });
});
