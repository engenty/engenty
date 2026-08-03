/**
 * THE capability matcher. A granted set covers a required capability when it
 * holds a global wildcard, the exact string, or a `<prefix>.*` wildcard at ANY
 * segment boundary of the required capability — so `module.*`,
 * `module.connections.*` and `module.connections.write.*` all cover
 * `module.connections.write.gmail`. This is the single source of truth reused
 * by `evaluatePolicy` (server enforcement), the user-capabilities clamp, and
 * the admin console's "can they …?" tester — so those answers can never drift
 * from each other.
 *
 * What this deliberately does NOT do is treat a held capability as covering
 * everything beneath it: holding `module.team-chat` does not grant
 * `module.team-chat.manage`. That rule would read as natural hierarchy and be
 * a silent privilege escalation — `team-chat.member` holds exactly that bare
 * capability today, and would have become a manager. Widening is only ever
 * expressed by an explicit `.*`, which somebody has to write down.
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
  const segments = required.split(".");
  for (let i = 1; i < segments.length; i++) {
    if (granted.includes(`${segments.slice(0, i).join(".")}.*`)) {
      return true;
    }
  }
  return false;
}
