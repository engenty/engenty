#!/usr/bin/env node
/**
 * Writes the Portless HTTPS dev URL block into repo-root `.env.local`.
 * Browser entry: https://engenty.localhost (core dev gateway).
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

const portlessConfigPath = path.join(resolveWorkspaceRoot(), "portless.json");
const envLocalPath = path.join(resolveWorkspaceRoot(), ".env.local");

function main() {
  if (!fs.existsSync(portlessConfigPath)) {
    console.error(`Missing ${portlessConfigPath}`);
    process.exit(1);
  }

  const names = loadPortlessNames(portlessConfigPath);
  const headerComments = buildPortlessAppUrlComments(names);
  const entries = writeDevUrlBlock(envLocalPath, buildPortlessEntries(names), {
    headerComments,
  });

  console.log(`Updated ${envLocalPath} with Portless dev URLs:`);
  console.log(`  Open ${entries.ENGENTY_UI_BASE_URL}/ after pnpm portless && pnpm dev`);
  for (const line of headerComments) {
    console.log(`  ${line.replace(/^#\s?/, "")}`);
  }
}

main();
