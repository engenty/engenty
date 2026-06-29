/**
 * Shared Vitest setup for the monorepo test run (`pnpm test`).
 * Individual packages may add their own vitest.config.ts for filtered runs.
 */
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "test-anon-key";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";
