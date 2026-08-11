/**
 * Shared Vitest setup for the monorepo test run (`pnpm test`).
 * Individual packages may add their own vitest.config.ts for filtered runs.
 *
 * Keys must be JWT-shaped (three base64 segments). PostgREST rejects opaque
 * placeholders like `test-anon-key` with PGRST301 when a local Supabase is up;
 * the demokey pair matches `supabase start` defaults so accidental live hits
 * authenticate, and CI (no listener on :54321) still fails closed on connect.
 */
const SUPABASE_ANON_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= SUPABASE_SERVICE_ROLE_JWT;
process.env.SUPABASE_ANON_KEY ??= SUPABASE_ANON_JWT;
process.env.SUPABASE_PUBLISHABLE_KEY ??= SUPABASE_ANON_JWT;
process.env.VITE_SUPABASE_ANON_KEY ??= SUPABASE_ANON_JWT;
