#!/usr/bin/env node
/**
 * Writes the default localhost dev URL block into repo-root `.env.local`.
 * Browser entry: http://localhost:5173 (Vite proxies /api, /ai, /docs).
 */
import path from "node:path";
import {
  buildLocalhostAppUrlComments,
  buildLocalhostEntries,
  resolveWorkspaceRoot,
  writeDevUrlBlock,
} from "./dev-env-urls.mjs";

const envLocalPath = path.join(resolveWorkspaceRoot(), ".env.local");

function main() {
  const entries = writeDevUrlBlock(envLocalPath, buildLocalhostEntries(), {
    headerComments: buildLocalhostAppUrlComments(),
  });
  console.log(`Updated ${envLocalPath} with localhost dev URLs:`);
  console.log(`  Open ${entries.ENGENTY_UI_BASE_URL}/ after pnpm dev`);
  for (const line of buildLocalhostAppUrlComments()) {
    console.log(`  ${line.replace(/^#\s?/, "")}`);
  }
}

main();
