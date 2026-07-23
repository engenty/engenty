import {
  businessPackage,
  enterprisePackage,
  freePackage,
  teamPackage,
} from "./config/packages/index.js";
import type { EntitlementPackage } from "./types.js";

/**
 * The authored commercial-package catalog. Synced into `core.packages` at boot
 * (version-based upsert) with a restore-defaults path, mirroring the model
 * pricing seeds in `@engenty/ai-core`.
 *
 * Edit a package under `src/config/packages/<id>.ts` and bump that entry's
 * `version` to roll a change out; the sync upserts entries whose version is
 * newer. Add a new package file and register it in this array.
 */
export const DEFAULT_ENTITLEMENT_PACKAGES: readonly EntitlementPackage[] = [
  freePackage,
  teamPackage,
  businessPackage,
  enterprisePackage,
];

export {
  businessPackage,
  enterprisePackage,
  freePackage,
  teamPackage,
} from "./config/packages/index.js";

/** Look up an authored package by id. */
export function findEntitlementPackage(
  id: string
): EntitlementPackage | undefined {
  return DEFAULT_ENTITLEMENT_PACKAGES.find((pkg) => pkg.id === id);
}
