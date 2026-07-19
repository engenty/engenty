#!/usr/bin/env node
// Builds the macOS desktop app locally and attaches the .dmg to the GitHub
// release of the current version. Replaces the tag-triggered CI build:
// releases are cut locally anyway (`pnpm release`), an M-series Mac builds
// the dmg in ~6min vs ~20 (10x-billed) minutes on a hosted macOS runner.
//
// Usage, after `pnpm release && git push origin main --follow-tags`:
//   pnpm release:desktop
//
// The CI workflow (.github/workflows/desktop-release.yml) stays available
// via workflow_dispatch as a fallback for Macs without a build toolchain.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function run(command, opts = {}) {
  execSync(command, { cwd: root, stdio: "inherit", ...opts });
}

function capture(command) {
  return execSync(command, { cwd: root, encoding: "utf8" }).trim();
}

const version = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8")
).version;
const tag = `v${version}`;

// Guard: the tag must exist (release was cut) so the dmg lands on the right
// GitHub release. Prevents uploading a WIP build under a stale version.
try {
  capture(`git rev-parse -q --verify refs/tags/${tag}`);
} catch {
  console.error(
    `Tag ${tag} does not exist — run \`pnpm release\` (and push) first.`
  );
  process.exit(1);
}

console.log(`Building desktop app for ${tag}…`);
run("pnpm build");
// .app only: tauri's dmg bundler styles the volume window via Finder
// AppleScript, which needs a per-process macOS Automation grant (error
// -1743 headless). hdiutil below builds an unstyled but fully functional
// drag-to-Applications dmg with no TCC permission at all.
run("pnpm --filter @engenty/desktop exec tauri build --bundles app");

const bundleDir = resolve(root, "apps/desktop/src-tauri/target/release/bundle");
const app = resolve(bundleDir, "macos/engenty.app");
if (!existsSync(app)) {
  console.error(`Expected bundle not found: ${app}`);
  process.exit(1);
}

const asset = `engenty-desktop-${tag}-macos-arm64.dmg`;
const stage = resolve(bundleDir, "dmg-stage");
const dmg = resolve(bundleDir, asset);
run(`rm -rf "${stage}" "${dmg}"`);
run(`mkdir -p "${stage}"`);
run(`cp -R "${app}" "${stage}/"`);
run(`ln -s /Applications "${stage}/Applications"`);
run(
  `hdiutil create -volname engenty -srcfolder "${stage}" -ov -format UDZO -quiet "${dmg}"`
);
run(`rm -rf "${stage}"`);

// Create the release if the tag push beat `pnpm release`'s GitHub release
// (parity with the CI fallback), then attach.
try {
  capture(`gh release view ${tag} --json tagName -q .tagName`);
} catch {
  run(`gh release create ${tag} --title ${tag} --generate-notes`);
}
run(`gh release upload ${tag} "${dmg}" --clobber`);
console.log(`✔ ${asset} attached to the ${tag} release.`);
