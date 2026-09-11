#!/usr/bin/env node
/**
 * Re-applies the engenty patch to @mastra/core after a version bump.
 *
 * WHY THIS EXISTS: `ChatChannelOutputProcessor#openSession` guards the channel
 * render driver with `.catch(err => { log; throw err })`. The rethrow rejects the
 * NEW promise `.catch()` returns — which is the one stored as `driverPromise` and
 * handed to the caller — so the unhandled rejection the guard means to prevent
 * simply moves one link down the chain. Nothing observes that promise until a
 * terminal chunk closes the queue, and the tool-card post in `runStaticDriver` is
 * the one `chatThread.post` neither driver wraps. An adapter that rejects while a
 * tool is running (expired bot token, uninstalled app) therefore takes the whole
 * process down. Fix is upstream in mastra-ai/mastra#22164; delete this script and
 * the patch once a release carries it.
 *
 * WHY A SCRIPT: the patch targets built dist chunks whose filenames are content
 * hashes (`agent-DSxJoGjY.js`), so they change on every release and a stored diff
 * can never re-apply. This matches on CONTENT instead, and refuses loudly rather
 * than patching the wrong thing if upstream reshapes the block.
 *
 * Usage, after bumping @mastra/core in apps/ai/package.json:
 *
 *   1. remove the old `@mastra/core@<old>` entry from patchedDependencies
 *   2. pnpm install
 *   3. pnpm patch @mastra/core@<new>
 *   4. node scripts/patch-mastra-core.mjs <the dir step 3 printed>
 *   5. pnpm patch-commit <same dir>
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ANCHOR = "channel render driver failed early";
const OPEN = "\t\treturn {\n\t\t\tqueue,\n\t\t\tdriverPromise:";
const OPEN_NEW = "\t\tconst rendered = {\n\t\t\tqueue,\n\t\t\tdriverPromise:";
const CLOSE = "\t\t\t\tthrow err;\n\t\t\t})\n\t\t};\n";
const ADDED = `\t\t// engenty patch: the \`throw err\` above re-rejects driverPromise, which stays
\t\t// unowned until the terminal-chunk await in processOutputStream. If the driver
\t\t// fails EARLY (the unguarded tool-card post in runStaticDriver: bad token,
\t\t// platform outage) that window makes the rejection unhandled and crashes the
\t\t// whole process. Attach a no-op catch so the rejection is owned; the later
\t\t// \`await session.driverPromise\` still observes it and logs.
\t\trendered.driverPromise.catch(() => {});
\t\treturn rendered;
`;

function patchFile(path, name) {
  const src = readFileSync(path, "utf8");
  if (!src.includes(ANCHOR)) {
    return false;
  }
  if (src.includes("engenty patch")) {
    console.log(`  ${name}: already patched`);
    return true;
  }
  const opens = src.split(OPEN).length - 1;
  const closes = src.split(CLOSE).length - 1;
  if (opens !== 1 || closes !== 1) {
    throw new Error(
      `${name}: expected exactly one match (open=${opens}, close=${closes}) — ` +
        "upstream reshaped the block, re-derive the patch by hand"
    );
  }
  writeFileSync(
    path,
    src.replace(OPEN, OPEN_NEW).replace(CLOSE, CLOSE + ADDED)
  );
  console.log(`  ${name}: patched`);
  return true;
}

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/patch-mastra-core.mjs <pnpm-patch-dir>");
  process.exit(1);
}

const dist = join(dir, "dist");
let patched = 0;
for (const name of readdirSync(dist).sort()) {
  if (!(name.startsWith("agent-") && /\.(js|cjs)$/.test(name))) {
    continue;
  }
  if (patchFile(join(dist, name), name)) {
    patched += 1;
  }
}

// One ESM chunk and one CJS chunk carry the processor; anything else means the
// bundle was resplit and the patch needs re-deriving.
if (patched !== 2) {
  console.error(`expected 2 files carrying the anchor, patched ${patched}`);
  process.exit(1);
}
console.log(`OK — ${patched} files`);
