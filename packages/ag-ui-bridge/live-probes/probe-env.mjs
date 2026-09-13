/**
 * Shared setup for the AG-UI probe scripts (PLAN-agui-httpagent-probe.md).
 *
 * These are MANUAL tools — they need a running dev server and make real LLM
 * calls, so nothing in CI touches them. The deterministic guard is the wire
 * conformance test in apps/ai. See probe/README.md.
 *
 * Everything machine-specific is derived, not hardcoded: the repo root by walking
 * up from this file, and the AI port from this worktree's own dev slot. An
 * earlier version pinned both to one developer's checkout and one port, which
 * would have broken in every other worktree.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Nearest ancestor holding a pnpm workspace manifest — i.e. the worktree root. */
export function repoRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error("could not locate the repo root from probe/probe-env.mjs");
}

/** `.env.local` as a plain object. Not a full dotenv parser — enough for these. */
export function env() {
  const path = join(repoRoot(), ".env.local");
  if (!existsSync(path)) {
    throw new Error(
      `${path} not found — run \`pnpm engenty setup\` in this worktree first`
    );
  }
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) {
      out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

/**
 * Origin of THIS worktree's AI app. `AI_BASE` wins; otherwise the port comes from
 * the dev slot assigned to `ENGENTY_DEV_DOMAIN`, so the scripts follow whatever
 * slot `pnpm dev:portless` handed this worktree.
 *
 * The raw port, deliberately, not the `.localhost` gateway origin — these scripts
 * are not a browser and have no reason to go through TLS.
 */
export function aiBaseUrl(e = env()) {
  if (process.env.AI_BASE) {
    return process.env.AI_BASE;
  }
  const domain = e.ENGENTY_DEV_DOMAIN;
  const slotsPath = join(repoRoot(), ".engenty", "dev-slots.json");
  if (domain && existsSync(slotsPath)) {
    const slots = JSON.parse(readFileSync(slotsPath, "utf8"));
    const port = slots?.domains?.[domain]?.ports?.ai;
    if (port) {
      return `http://127.0.0.1:${port}`;
    }
  }
  throw new Error(
    "could not resolve the AI port — set AI_BASE, or start the dev server so " +
      `.engenty/dev-slots.json has an entry for domain "${domain ?? "(unset)"}"`
  );
}

/** Dev-login through Supabase; returns a bearer token for the AI app. */
export async function signIn(e = env()) {
  const res = await fetch(
    `${e.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: e.VITE_SUPABASE_ANON_KEY ?? e.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email: e.ENGENTY_DEV_EMAIL,
        password: e.ENGENTY_DEV_PASS,
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`sign-in ${res.status}: ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

export async function createThread(ai, token, agentId, title) {
  const res = await fetch(`${ai}/ai/threads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ agent_id: agentId, title }),
  });
  if (!res.ok) {
    throw new Error(`createThread ${res.status}: ${await res.text()}`);
  }
  return (await res.json()).session.id;
}
