#!/usr/bin/env node
/**
 * The wizard lives in packages/cli/wizard (published as part of the `engenty`
 * npm package, so `npx engenty deploy` runs it from anywhere). This entry
 * keeps `node deploy/scripts/deploy-wizard.mjs` working from a clone.
 */
await import("../../packages/cli/wizard/deploy-wizard.mjs");
