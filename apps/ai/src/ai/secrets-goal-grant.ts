import { getEngentyCoreBaseUrlFromEnv } from "./core-http-client.js";

/**
 * The DURABLE half of approving an agent's secrets_reveal: persist a
 * goal-scoped grant in core (agent_goal_grants via the secrets module's
 * endpoint) BEFORE the operation is (re-)invoked as the agent, so the reveal
 * policy's goal-grant branch matches and the rest of the conversation proceeds
 * without re-prompting. Runs on the approving USER's own bearer token — core
 * enforces that the approver can reveal the secret themselves (the ceiling).
 * Non-fatal: on failure the run continues; core just re-gates the reveal.
 */
export async function persistSecretsGoalGrant(params: {
  coreBaseUrl?: string;
  goalId: string;
  secretId: string;
  accessToken?: string;
}): Promise<void> {
  const coreBaseUrl = params.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
  if (!(coreBaseUrl && params.accessToken)) {
    return;
  }
  try {
    const url = new URL(
      `/api/secrets/${encodeURIComponent(params.secretId)}/goal-grants`,
      coreBaseUrl
    );
    const res = await fetch(url, {
      body: JSON.stringify({ goal_id: params.goalId }),
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!res.ok) {
      console.error(
        `secrets goal-grant persist failed: ${res.status} ${await res
          .text()
          .catch(() => "")}`
      );
    }
  } catch (err) {
    console.error("secrets goal-grant persist failed", err);
  }
}
