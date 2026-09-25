/**
 * How far a Space's shared computer may reach off the machine.
 *
 * `egress` routes outbound traffic through the host's allowlist proxy, so
 * package installs and third-party APIs work; `none` gives the container no
 * network at all. Engenty tools and Code Mode's RPC travel over stdio either
 * way, so `none` still executes code against Engenty data — it only removes
 * the open internet.
 *
 * The tier belongs to the SPACE, not to an agent: the machine is one per
 * space and its HostConfig is fixed by whoever starts it first, so a per-agent
 * declaration would make the machine's reach depend on run ordering. A space
 * that sets nothing inherits the host default
 * (`ENGENTY_SPACE_COMPUTER_NETWORK_TIER`).
 */

export const COMPUTER_NETWORK_TIERS = ["none", "egress"] as const;

export type ComputerNetworkTier = (typeof COMPUTER_NETWORK_TIERS)[number];

export function parseComputerNetworkTier(
  raw: unknown
): ComputerNetworkTier | null {
  if (raw === "none" || raw === "egress") {
    return raw;
  }
  return null;
}

/** Most hosts one Space may add (`spaces_computer_egress_hosts_size_check`). */
export const COMPUTER_EGRESS_HOSTS_MAX = 100;

const EGRESS_HOST_PATTERN =
  /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/;

/**
 * One host a Space's computer may reach beyond the shared registry allowlist:
 * an exact host (`api.example.com`) or every subdomain of one
 * (`*.example.com`, which does not include `example.com` itself). Lowercased;
 * null when it is neither — no ports, schemes, paths or bare TLDs.
 */
export function parseComputerEgressHost(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const host = raw.trim().toLowerCase().replace(/\.$/, "");
  return host.length <= 253 && EGRESS_HOST_PATTERN.test(host) ? host : null;
}
