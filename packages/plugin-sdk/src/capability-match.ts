/**
 * THE capability matcher. A granted set covers a required capability when it
 * holds a global wildcard, the exact string, or the `<prefix>.*` wildcard for
 * the required capability's first segment. This is the single source of truth
 * reused by `evaluatePolicy` (server enforcement), the user-capabilities clamp,
 * and the admin console's "can they …?" tester — so those answers can never
 * drift from each other.
 */
export function capabilityCovers(granted: string[], required: string): boolean {
  if (
    granted.includes("*") ||
    granted.includes("core.superadmin") ||
    granted.includes("core.*")
  ) {
    return true;
  }
  if (granted.includes(required)) {
    return true;
  }
  const [prefix] = required.split(".");
  return granted.includes(`${prefix}.*`);
}
