#!/usr/bin/env node
// Golden-query harness for the KB search migration (retrieval Phase 2).
//
//   node run-golden.mjs --record   # capture current results as baseline.json
//   node run-golden.mjs --check    # compare current results against baseline
//
// Talks to the admin search route of a running core
// (POST /api/search-index/providers/kb.article/search) with a fresh dev
// login. Gate: baseline top-1 must appear in the new top-3; report all diffs.
//
// Env: CORE_URL (default http://127.0.0.1:8877), SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY, ENGENTY_DEV_EMAIL, ENGENTY_DEV_PASS — the runner
// sources them from the repo .env.local when not set.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const QUERIES_PATH = path.join(here, "golden-queries.json");
const BASELINE_PATH = path.join(here, "baseline.json");
const TOP_N = 5;

function loadEnvLocal() {
  const envPath = path.join(repoRoot, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2];
    }
  }
}
loadEnvLocal();

const CORE_URL = process.env.CORE_URL ?? "http://127.0.0.1:8877";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

async function login() {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      body: JSON.stringify({
        email: process.env.ENGENTY_DEV_EMAIL,
        password: process.env.ENGENTY_DEV_PASS,
      }),
      headers: {
        apikey: process.env.VITE_SUPABASE_ANON_KEY ?? "",
        "content-type": "application/json",
      },
      method: "POST",
    }
  );
  const body = await response.json();
  if (!body.access_token) {
    throw new Error(`dev login failed: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.access_token;
}

async function searchOnce(token, query) {
  const response = await fetch(
    `${CORE_URL}/api/search-index/providers/kb.article/search`,
    {
      body: JSON.stringify({ limit: TOP_N, query }),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      method: "POST",
    }
  );
  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(
      `search failed (${response.status}): ${JSON.stringify(body).slice(0, 200)}`
    );
  }
  const data = body.data ?? body;
  const results = data.matches ?? data.results ?? [];
  return results.map((entry) => {
    const item = entry.item ?? entry;
    return {
      article_id: item.article_id ?? item.doc_id ?? item.id ?? null,
      score: Number(entry.score ?? 0),
      title: item.title ?? null,
    };
  });
}

async function run() {
  const mode = process.argv.includes("--record")
    ? "record"
    : process.argv.includes("--check")
      ? "check"
      : null;
  if (!mode) {
    console.error("usage: run-golden.mjs --record | --check");
    process.exit(2);
  }
  const { queries } = JSON.parse(fs.readFileSync(QUERIES_PATH, "utf8"));
  const token = await login();

  const current = {};
  for (const spec of queries) {
    current[spec.id] = await searchOnce(token, spec.query);
    process.stdout.write(".");
  }
  console.log("");

  if (mode === "record") {
    fs.writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify({ recorded_at: new Date().toISOString(), results: current }, null, 2)}\n`
    );
    for (const spec of queries) {
      const top = current[spec.id][0];
      console.log(
        `${spec.id.padEnd(24)} top1=${top ? `${top.title} (${top.score.toFixed(3)})` : "—"}`
      );
    }
    console.log(`\nbaseline written: ${BASELINE_PATH}`);
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")).results;
  let failures = 0;
  for (const spec of queries) {
    const base = baseline[spec.id] ?? [];
    const next = current[spec.id] ?? [];
    const baseTop1 = base[0]?.article_id ?? null;
    const nextTop3 = next.slice(0, 3).map((r) => r.article_id);
    const pass = baseTop1 == null || nextTop3.includes(baseTop1);
    if (!pass) failures++;
    const delta =
      base[0] && next[0] ? (next[0].score - base[0].score).toFixed(3) : "n/a";
    console.log(
      `${pass ? "PASS" : "FAIL"} ${spec.id.padEnd(24)} base-top1=${base[0]?.title ?? "—"} | new-top1=${next[0]?.title ?? "—"} | Δtop-score=${delta}`
    );
  }
  console.log(
    failures === 0
      ? "\nGOLDEN: all queries at parity"
      : `\nGOLDEN: ${failures} regression(s)`
  );
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
