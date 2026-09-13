/**
 * The probes live in packages/cli (published as `engenty`) so `npx engenty
 * doctor --remote` carries them; this path stays for the scripts that import
 * them from the checkout.
 */
export * from "../../packages/cli/lib/supabase-probes.mjs";
