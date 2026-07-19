// Integration-lane setup: resolve the local Supabase env (falling back to
// repo-root .env.local) and fail fast with a clear message when the stack is
// missing — before any suite starts seeding data.
import { resolveIntegrationEnv } from "@engenty/test-kit/integration";

resolveIntegrationEnv();
