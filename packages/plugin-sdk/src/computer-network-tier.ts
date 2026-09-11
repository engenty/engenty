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
