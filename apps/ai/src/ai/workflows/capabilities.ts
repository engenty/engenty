// Which capability does a module operation need?
//
// Core is the AUTHORITY here — every `engenty_tool` call goes through the
// gateway, which runs the real check with the full plugin registry. This module
// is the save-time approximation, and it exists for two reasons: the designer
// can put an honest "you don't hold this" badge on a node before anything runs,
// and a graph that would fail at execute time is rejected at author time
// instead of at 3am inside a sleeping run.
//
// Because it's an approximation it must be CONSERVATIVE: when in doubt, demand
// write. A false "you need write" is a visible, fixable annoyance; a false
// "this is fine" is a graph that fails in production.

/** `"invoices_update"` → `"invoices"`; `"tasks_get"` → `"tasks"`. */
export function moduleIdForOperation(operationId: string): string | undefined {
  const trimmed = operationId.trim();
  if (!trimmed) {
    return;
  }
  // Module operations are `<module>_<verb>` (see the `<module>_update`
  // convention apply-field-updates relies on). Dotted ids appear in core's own
  // inference, so accept both separators.
  const separator = trimmed.includes("_")
    ? trimmed.indexOf("_")
    : trimmed.indexOf(".");
  if (separator <= 0) {
    return;
  }
  return trimmed.slice(0, separator);
}

const READ_VERBS = new Set(["get", "list", "search", "read", "find", "count"]);

/**
 * Mirrors core's `inferCapabilityFromOperation`, scoped to the module the way
 * engenty capability ids are (`module.<id>.read` / `.write`).
 */
export function capabilityForModuleOperation(
  operationId: string
): string | undefined {
  const moduleId = moduleIdForOperation(operationId);
  if (!moduleId) {
    return;
  }
  const verb = operationId.slice(moduleId.length + 1).toLowerCase();
  const isRead = [...READ_VERBS].some(
    (readVerb) => verb === readVerb || verb.endsWith(`_${readVerb}`)
  );
  return `module.${moduleId}.${isRead ? "read" : "write"}`;
}
