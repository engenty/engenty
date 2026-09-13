#!/usr/bin/env node
/**
 * The Supabase CLI version is pinned in one place —
 * packages/cli/src/supabase-cli-version.ts — and must equal the root
 * devDependency (what a checkout runs) and deploy/Dockerfile.migrate (what
 * the migrate image runs). `npx engenty deploy migrate` fetches the pin.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const pin = read("packages/cli/src/supabase-cli-version.ts").match(
  /SUPABASE_CLI_VERSION = "([^"]+)"/
)?.[1];
const devDependency = JSON.parse(read("package.json")).devDependencies
  ?.supabase;
const image = read("deploy/Dockerfile.migrate").match(
  /npm install -g supabase@([\d.]+)/
)?.[1];

const rows = {
  pin,
  "package.json devDependencies.supabase": devDependency,
  "deploy/Dockerfile.migrate": image,
};
const mismatched = Object.entries(rows).filter(([, value]) => value !== pin);
if (!pin || mismatched.length > 0) {
  console.error("Supabase CLI pin mismatch:");
  for (const [label, value] of Object.entries(rows)) {
    console.error(`  ${label}: ${value ?? "(missing)"}`);
  }
  console.error(
    "Set all three to one version (packages/cli/src/supabase-cli-version.ts is the source)."
  );
  process.exit(1);
}
console.log(`check-supabase-pin: supabase@${pin} everywhere`);
