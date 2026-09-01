/**
 * Mastra ships a ~390-route REST API (`/agents`, `/workflows`, `/memory/*`,
 * `/stored/*`, `/workspaces/*`, `/schedules`, …) that its Studio dev UI drives.
 * Mounting it via `MastraServer` puts every one of those routes on our Hono app
 * under {@link AI_BASE_PATH}.
 *
 * That surface is **unauthenticated unless `server.experimental_auth` is set on
 * the Mastra instance** — with no auth config, `checkRouteAuth()` returns null
 * and each route runs. Our own `/ai/*` routes authenticate individually
 * (`resolveScope`), so none of them covers Mastra's, and apps/core proxies the
 * whole `/ai` prefix, which put the lot on the public edge: an anonymous
 * `GET /ai/agents/:agentId/suspended-runs` listed live runIds/threadIds and
 * `POST /ai/agents/:agentId/approve-tool-call` accepted them.
 *
 * Nothing in this product calls that API — no `@mastra/client-js` anywhere in
 * the repo, and the remote-channel webhooks mount their own routes (see
 * api/remote-channels.ts). Its only consumer is Mastra Studio, which is opt-in
 * dev tooling (`pnpm dev:studio`, `pnpm dev:portless --studio`). So the surface
 * is not guarded, it is simply not mounted: off unless a developer opts in, and
 * un-optable in production, where no Studio runs.
 */

/** Env flag the `--studio` dev scripts set; see scripts/dev.sh. */
export const MASTRA_STUDIO_API_ENV = "ENGENTY_MASTRA_STUDIO_API";

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/**
 * Whether to mount Mastra's native REST API on this app.
 *
 * Production ignores the flag outright rather than trusting deployments not to
 * set it — the same no-dev-bypass-in-reverse posture the escalation seam uses.
 */
export function isMastraStudioApiEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.NODE_ENV === "production") {
    return false;
  }
  return isTruthy(env[MASTRA_STUDIO_API_ENV]);
}
