/**
 * The one Supabase CLI pin. The checkout vendors it as a root devDependency
 * (`pnpm install`); outside a checkout `engenty deploy migrate` fetches this
 * exact version through `npx`; `deploy/Dockerfile.migrate` installs it into
 * the migrate image. `pnpm check:supabase-pin` keeps the three equal.
 */
export const SUPABASE_CLI_VERSION = "2.113.0";
