/**
 * Moved into the published package so `engenty start` can write a managed
 * install's config.toml outside a checkout. `scripts/setup.mjs` and
 * `scripts/generate.mjs` keep importing it from here.
 */
export * from "../../packages/cli/lib/supabase-local-stack.mjs";
