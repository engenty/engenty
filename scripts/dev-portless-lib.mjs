/**
 * Worktree-aware Portless dev: domain resolution, port slots, route names.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPortlessNames } from "./dev-env-urls.mjs";

export const MAIN_WORKTREE_BASENAME = "engenty-pro";
export const SLOT_PORT_STEP = 10;
export const SLOT_REGISTRY_DIR = ".engenty";
export const SLOT_REGISTRY_FILE = "dev-slots.json";

/** @typedef {{ ui: number; core: number; ai: number; docs: number; www: number; studio: number; manage: number; appHost: number }} DevPorts */

/** @typedef {{ slot: number; ports: DevPorts }} DomainSlotEntry */

/** @typedef {{ domains: Record<string, DomainSlotEntry>; nextSlot: number }} SlotRegistry */

const BASE_PORTS = {
  ui: 5173,
  core: 8787,
  ai: 8790,
  docs: 3002,
  www: 3003,
  studio: 43_111,
  // Manage is a gateway sub-path (/manage), like the UI — served on its own
  // localhost port, reached through the gateway origin (no direct portless host).
  manage: 5174,
  // apps/app-host serves tenant-authored code. It gets NO Portless host and NO
  // gateway URL — only apps/ai talks to it, server-to-server.
  appHost: 8795,
};

export function resolveWorkspaceRoot(
  fromDir = path.dirname(fileURLToPath(import.meta.url))
) {
  return path.resolve(fromDir, "..");
}

export function slotRegistryPath(workspaceRoot = resolveWorkspaceRoot()) {
  return path.join(workspaceRoot, SLOT_REGISTRY_DIR, SLOT_REGISTRY_FILE);
}

export function sanitizeDomain(input) {
  const normalized = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.slice(0, 63) || null;
}

export function resolveDomainFromBasename(basename) {
  const name = path.basename(basename);
  if (!name || name === MAIN_WORKTREE_BASENAME) {
    return null;
  }
  return sanitizeDomain(name);
}

export function countGitWorktrees(cwd = process.cwd()) {
  try {
    const listOutput = execFileSync(
      "git",
      ["worktree", "list", "--porcelain"],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    return listOutput.split("\n").filter((line) => line.startsWith("worktree "))
      .length;
  } catch {
    return 1;
  }
}

/**
 * @param {{ explicitDomain?: string | null; cwd?: string; basename?: string }} params
 */
export function resolveDevDomain(params = {}) {
  const cwd = params.cwd ?? process.cwd();
  const explicit = params.explicitDomain?.trim();
  if (explicit) {
    const sanitized = sanitizeDomain(explicit);
    if (!sanitized) {
      throw new Error(`Invalid --domain value: ${explicit}`);
    }
    return sanitized;
  }

  const basename = params.basename ?? path.basename(cwd);
  const worktreeCount = params.worktreeCount ?? countGitWorktrees(cwd);
  if (worktreeCount <= 1) {
    return null;
  }

  return resolveDomainFromBasename(basename);
}

export function portsForSlot(slot) {
  const step = slot * SLOT_PORT_STEP;
  return {
    ui: BASE_PORTS.ui + step,
    core: BASE_PORTS.core + step,
    ai: BASE_PORTS.ai + step,
    docs: BASE_PORTS.docs + step,
    www: BASE_PORTS.www + step,
    studio: BASE_PORTS.studio + step,
    manage: BASE_PORTS.manage + step,
    appHost: BASE_PORTS.appHost + step,
  };
}

/** @returns {SlotRegistry} */
export function emptySlotRegistry() {
  return { domains: {}, nextSlot: 1 };
}

/** @returns {SlotRegistry} */
export function readSlotRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) {
    return emptySlotRegistry();
  }
  const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  return {
    domains: parsed.domains ?? {},
    nextSlot: Number.isInteger(parsed.nextSlot) ? parsed.nextSlot : 1,
  };
}

/** @param {string} registryPath @param {SlotRegistry} registry */
export function writeSlotRegistry(registryPath, registry) {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(
    registryPath,
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf8"
  );
}

/**
 * @param {{ domain?: string | null; workspaceRoot?: string; persist?: boolean }} params
 */
export function resolveDevPorts(params = {}) {
  const workspaceRoot = params.workspaceRoot ?? resolveWorkspaceRoot();
  const registryPath = slotRegistryPath(workspaceRoot);
  const domain = params.domain ?? null;
  const persist = params.persist ?? true;

  if (!domain) {
    return {
      domain: null,
      slot: 0,
      ports: portsForSlot(0),
      registryPath,
    };
  }

  const registry = readSlotRegistry(registryPath);
  const existing = registry.domains[domain];
  if (existing) {
    return {
      domain,
      slot: existing.slot,
      ports: { ...portsForSlot(existing.slot), ...existing.ports },
      registryPath,
    };
  }

  const slot = registry.nextSlot;
  const ports = portsForSlot(slot);
  if (persist) {
    registry.domains[domain] = { slot, ports };
    registry.nextSlot = slot + 1;
    writeSlotRegistry(registryPath, registry);
  }

  return { domain, slot, ports, registryPath };
}

/**
 * Portless route name: `tab-ui.engenty` or `engenty` when no domain.
 */
export function buildPortlessRouteName(baseName, domain) {
  if (!domain) {
    return baseName;
  }
  return `${domain}.${baseName}`;
}

/**
 * Gateway hostname for HTTPS origin: `tab-ui.engenty.localhost` or `engenty.localhost`.
 */
export function buildGatewayHostname(coreName, domain) {
  const routeName = buildPortlessRouteName(coreName, domain);
  return `${routeName}.localhost`;
}

export function portlessHttpsOrigin(hostname) {
  return `https://${hostname}`;
}

/**
 * @param {{ coreName: string; aiName: string; docsName: string; wwwName?: string; domain?: string | null }} names
 */
export function buildPortlessRouteNames(names) {
  const {
    coreName,
    aiName,
    docsName,
    wwwName = "www.engenty",
    domain = null,
  } = names;
  return {
    gateway: buildPortlessRouteName(coreName, domain),
    ai: buildPortlessRouteName(aiName, domain),
    docs: buildPortlessRouteName(docsName, domain),
    www: buildPortlessRouteName(wwwName, domain),
    gatewayHostname: buildGatewayHostname(coreName, domain),
    gatewayOrigin: portlessHttpsOrigin(buildGatewayHostname(coreName, domain)),
    aiOrigin: portlessHttpsOrigin(
      `${buildPortlessRouteName(aiName, domain)}.localhost`
    ),
    docsOrigin: portlessHttpsOrigin(
      `${buildPortlessRouteName(docsName, domain)}.localhost`
    ),
    wwwOrigin: portlessHttpsOrigin(
      `${buildPortlessRouteName(wwwName, domain)}.localhost`
    ),
  };
}

/** @param {DevPorts} ports @param {{ includeStudio?: boolean }} [options] */
export function buildGatewayEnvExports(ports, options = {}) {
  const includeStudio = options.includeStudio ?? true;
  /** @type {Record<string, string>} */
  const env = {
    ENV: "development",
    ENGENTY_UI_PORT: String(ports.ui),
    ENGENTY_CORE_PORT: String(ports.core),
    ENGENTY_AI_PORT: String(ports.ai),
    ENGENTY_DOCS_PORT: String(ports.docs),
    ENGENTY_WWW_PORT: String(ports.www),
    ENGENTY_MANAGE_PORT: String(ports.manage),
    ENGENTY_APP_HOST_PORT: String(ports.appHost),
    // apps/ai reaches app-host directly; deliberately NOT a gateway URL.
    ENGENTY_APP_HOST_URL: `http://127.0.0.1:${ports.appHost}`,
    ENGENTY_DEV_GATEWAY_UI_URL: `http://127.0.0.1:${ports.ui}`,
    ENGENTY_DEV_GATEWAY_AI_URL: `http://127.0.0.1:${ports.ai}`,
    ENGENTY_DEV_GATEWAY_DOCS_URL: `http://127.0.0.1:${ports.docs}`,
    ENGENTY_DEV_GATEWAY_MANAGE_URL: `http://127.0.0.1:${ports.manage}`,
  };
  if (includeStudio) {
    env.ENGENTY_STUDIO_PORT = String(ports.studio);
    env.ENGENTY_DEV_GATEWAY_STUDIO_URL = `http://127.0.0.1:${ports.studio}`;
  }
  return env;
}

/**
 * Rewrite docs/manage direct Portless redirects to the gateway origin.
 */
export function rewriteDevGatewayLocation(location, gatewayOrigin, docsOrigin) {
  if (typeof location !== "string") {
    return location;
  }
  let next = location;
  if (docsOrigin && next.includes(docsOrigin)) {
    next = next.replaceAll(docsOrigin, gatewayOrigin);
  }
  if (next.includes("docs.engenty.localhost")) {
    next = next.replaceAll("https://docs.engenty.localhost", gatewayOrigin);
  }
  if (next.includes("manage.engenty.localhost")) {
    next = next.replaceAll(
      "https://manage.engenty.localhost",
      `${gatewayOrigin}/manage`
    );
  }
  return next;
}

/**
 * @param {{ explicitDomain?: string | null; cwd?: string; workspaceRoot?: string; persist?: boolean }} params
 */
export function resolveDevPortlessConfig(params = {}) {
  const workspaceRoot = params.workspaceRoot ?? resolveWorkspaceRoot();
  const cwd = params.cwd ?? workspaceRoot;
  const domain = resolveDevDomain({
    explicitDomain: params.explicitDomain,
    cwd,
  });
  const { slot, ports } = resolveDevPorts({
    domain,
    workspaceRoot,
    persist: params.persist ?? true,
  });
  const portlessConfigPath = path.join(workspaceRoot, "portless.json");
  const names = loadPortlessNames(portlessConfigPath);
  const routes = buildPortlessRouteNames({
    coreName: names.coreName,
    aiName: names.aiName,
    docsName: names.docsName,
    wwwName: names.wwwName,
    domain,
  });
  const env = buildGatewayEnvExports(ports, { includeStudio: !domain });
  if (domain) {
    env.ENGENTY_DEV_DOMAIN = domain;
  }

  return {
    domain,
    slot,
    ports,
    routes,
    env,
    gatewayOrigin: routes.gatewayOrigin,
    docsDirectOrigin: routes.docsOrigin,
    portlessAliases: [
      { name: routes.gateway, port: ports.core },
      { name: routes.ai, port: ports.ai },
      { name: routes.docs, port: ports.docs },
      { name: routes.www, port: ports.www },
    ],
  };
}

function parseCliArgs(argv) {
  /** @type {{ command?: string; domain?: string; cwd?: string; json?: boolean }} */
  const result = {};
  const positional = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--json") {
      result.json = true;
    } else if (arg.startsWith("--domain=")) {
      result.domain = arg.slice("--domain=".length);
    } else if (arg === "--domain") {
      result.domain = argv[i + 1];
      i++;
    } else if (arg.startsWith("--cwd=")) {
      result.cwd = arg.slice("--cwd=".length);
    } else {
      positional.push(arg);
    }
    i++;
  }
  result.command = positional[0];
  return result;
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.command === "resolve") {
    const config = resolveDevPortlessConfig({
      explicitDomain: args.domain ?? null,
      cwd: args.cwd ?? process.cwd(),
      persist: true,
    });
    if (args.json) {
      process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
      return;
    }
    for (const [key, value] of Object.entries(config.env)) {
      process.stdout.write(`${key}=${value}\n`);
    }
    process.stdout.write(`GATEWAY_ORIGIN=${config.gatewayOrigin}\n`);
    return;
  }

  console.error(
    "Usage: node scripts/dev-portless-lib.mjs resolve [--domain=name] [--json]"
  );
  process.exit(1);
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  main();
}
