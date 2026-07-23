/**
 * Authored commercial-package definitions.
 *
 * One file per package. Register new packages here so they join
 * `DEFAULT_ENTITLEMENT_PACKAGES` and sync into `core.packages`.
 *
 * Module ids are plugin ids from the registry / tenant overrides.
 * Core/required modules (settings, copilot) are always allowed by the
 * enforcement point, so they are omitted from package allow-lists.
 */
export { freePackage } from "./free.js";
export { teamPackage } from "./team.js";
export { businessPackage } from "./business.js";
export { enterprisePackage } from "./enterprise.js";
