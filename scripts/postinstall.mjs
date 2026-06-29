#!/usr/bin/env node
/**
 * Warm the CLI/core build right after `pnpm install` so `pnpm engenty …` and
 * `pnpm dev` start without a first-run build.
 *
 * Best-effort by design: it must NEVER fail the install. If the build errors
 * (or is skipped via ENGENTY_SKIP_INSTALL_BUILD=1, e.g. in CI), the engenty CLI
 * wrapper rebuilds on demand. Marker-gated, so repeat installs are a no-op.
 *
 * Output is prefixed with ". postinstall:" by pnpm, so messages here stay bare.
 */
import {
  ensureCliPackagesBuilt,
  ensureCoreDepsBuilt,
} from "./lib/ensure-cli-build.mjs";

if (process.env.ENGENTY_SKIP_INSTALL_BUILD === "1") {
  console.log(
    "ENGENTY_SKIP_INSTALL_BUILD=1 set — skipping build warm-up (CLI will build on demand)."
  );
  process.exit(0);
}

console.log(
  "Warming workspace build (engenty CLI packages + @engenty/core deps)…"
);

try {
  const cliBuilt = ensureCliPackagesBuilt();
  const coreDepsBuilt = ensureCoreDepsBuilt();

  if (cliBuilt || coreDepsBuilt) {
    const parts = [
      cliBuilt ? "CLI packages" : null,
      coreDepsBuilt ? "core deps" : null,
    ].filter(Boolean);
    console.log(`Built ${parts.join(" + ")} — workspace ready.`);
  } else {
    console.log("Already built — nothing to do.");
  }
} catch (err) {
  console.warn(
    `Build warm-up failed (non-fatal) — the engenty CLI will build on demand.\n  ${err?.message ?? err}`
  );
}

process.exit(0);
