#!/usr/bin/env node
/**
 * Writes the Portless HTTPS dev URL block into repo-root `.env.local`.
 * Browser entry: https://engenty.localhost or https://<domain>.engenty.localhost
 * See docs/dev/portless-local-urls.md.
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildPortlessAppUrlComments,
  buildPortlessEntries,
  loadPortlessNames,
  resolveWorkspaceRoot,
  writeDevUrlBlock,
} from "./dev-env-urls.mjs";
import { resolveDevDomain, resolveDevPorts } from "./dev-portless-lib.mjs";

const portlessConfigPath = path.join(resolveWorkspaceRoot(), "portless.json");
const envLocalPath = path.join(resolveWorkspaceRoot(), ".env.local");

function parseArgs(argv) {
  /** @type {{ domain?: string | null }} */
  const result = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--domain=")) {
      result.domain = arg.slice("--domain=".length);
    } else if (arg === "--domain") {
      result.domain = argv[i + 1];
      i++;
    }
    i++;
  }
  return result;
}

function main() {
  if (!fs.existsSync(portlessConfigPath)) {
    console.error(`Missing ${portlessConfigPath}`);
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const domain =
    args.domain === undefined
      ? resolveDevDomain({ cwd: process.cwd() })
      : resolveDevDomain({ explicitDomain: args.domain });

  const names = loadPortlessNames(portlessConfigPath);
  const { ports: slotPorts } = resolveDevPorts({
    domain,
    workspaceRoot: resolveWorkspaceRoot(),
    persist: false,
  });
  const headerComments = buildPortlessAppUrlComments({ ...names, domain });
  const entries = writeDevUrlBlock(
    envLocalPath,
    buildPortlessEntries({ ...names, domain, corePort: slotPorts.core }),
    { headerComments }
  );

  console.log(`Updated ${envLocalPath} with Portless dev URLs:`);
  console.log(`  Open ${entries.ENGENTY_UI_BASE_URL}/ after pnpm dev:portless`);
  if (domain) {
    console.log(`  Worktree domain: ${domain}`);
  }
  for (const line of headerComments) {
    console.log(`  ${line.replace(/^#\s?/, "")}`);
  }
}

main();
