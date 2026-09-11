/**
 * Live check: the interactive lane end to end, against a real model.
 *
 * Unit tests run on mock models and cannot see the failures that matter most
 * here — a run framed twice, or the Memory instance never reaching the agent.
 *
 * Three questions, in order of how badly they fail:
 *   1. does a plain turn stream text, and is the run framed EXACTLY once?
 *   2. does a gated turn park with a canonical AG-UI interrupt carrying a run id?
 *   3. does approving it resume from the snapshot and actually run the tool?
 */
import { aiBaseUrl, createThread, env, signIn } from "./probe-env.mjs";

const E = env();
const AI = aiBaseUrl(E);
const token = await signIn(E);

function sse(text) {
  return [...text.matchAll(/^data: (.*)$/gm)]
    .map((m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function runTurn(threadId, prompt) {
  const res = await fetch(`${AI}/ai/v1/threads/${threadId}/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      threadId,
      runId: crypto.randomUUID(),
      messages: [{ id: crypto.randomUUID(), role: "user", content: prompt }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
    }),
  });
  const body = await res.text();
  return { events: sse(body), raw: body, status: res.status };
}

function summarize(events) {
  const counts = {};
  for (const e of events) {
    counts[e.type] = (counts[e.type] ?? 0) + 1;
  }
  const text = events
    .filter((e) => e.type === "TEXT_MESSAGE_CONTENT")
    .map((e) => e.delta ?? "")
    .join("");
  return { counts, text };
}

const check = (label, ok, detail = "") =>
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  );

// ---------------------------------------------------------------- 1. plain turn
console.log("\n=== 1. a plain turn ===");
const t1 = await createThread(AI, token, "engenty.copilot", "I3 plain turn");
const r1 = await runTurn(t1, "Say the single word: ready. Nothing else.");
const s1 = summarize(r1.events);
console.log("http", r1.status, JSON.stringify(s1.counts));
console.log("text:", JSON.stringify(s1.text.slice(0, 120)));
if (!r1.events.length) {
  console.log("raw:", r1.raw.slice(0, 800));
}
check("streams assistant text", s1.text.trim().length > 0);
check(
  "RUN_STARTED exactly once",
  s1.counts.RUN_STARTED === 1,
  `got ${s1.counts.RUN_STARTED}`
);
check(
  "RUN_FINISHED exactly once",
  s1.counts.RUN_FINISHED === 1,
  `got ${s1.counts.RUN_FINISHED}`
);
check("no RUN_ERROR", !s1.counts.RUN_ERROR);
check(
  "no raw TEXT_MESSAGE_CHUNK on the wire",
  !s1.counts.TEXT_MESSAGE_CHUNK,
  "this wire is defined on the expanded form"
);
check(
  "no working-memory STATE_SNAPSHOT leaked",
  !s1.counts.STATE_SNAPSHOT,
  "our client stores that as the app-shell UI snapshot"
);

// ------------------------------------------------------------ 2. a gated turn
console.log("\n=== 2. a gated turn parks ===");
const t2 = await createThread(AI, token, "engenty.copilot", "I3 approval");
// A gated WRITE, so the approval gate fires rather than a browser tool.
const r2 = await runTurn(
  t2,
  "Create a contact named Live Probe Person with email probe@example.com. Do it now."
);
const s2 = summarize(r2.events);
console.log("http", r2.status, JSON.stringify(s2.counts));
const finished = r2.events.find((e) => e.type === "RUN_FINISHED");
const interrupts = finished?.outcome?.interrupts;
const openCustom = r2.events
  .filter((e) => e.type === "CUSTOM")
  .map((e) => e.value)
  .find((v) => v && typeof v.run_id === "string");
console.log("CUSTOM names:", [
  ...new Set(r2.events.filter((e) => e.type === "CUSTOM").map((e) => e.name)),
]);
console.log("interrupt outcome:", JSON.stringify(interrupts)?.slice(0, 400));
console.log("open interrupt:", JSON.stringify(openCustom)?.slice(0, 500));
check(
  "run parked with a canonical interrupt",
  Array.isArray(interrupts) && interrupts.length > 0
);
check(
  "the interrupt carries a resume run id",
  Boolean(openCustom?.run_id),
  String(openCustom?.run_id)
);
check("no RUN_ERROR", !s2.counts.RUN_ERROR);

// ------------------------------------------------------------------ 3. resume
if (openCustom?.run_id && openCustom?.tool_call_id) {
  console.log("\n=== 3. approving resumes from the SNAPSHOT (no park) ===");
  // The resume is the SAME /runs route with canonical AG-UI `resume` entries.
  const res = await fetch(`${AI}/ai/v1/threads/${t2}/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      threadId: t2,
      runId: crypto.randomUUID(),
      messages: [],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {},
      resume: [
        {
          interruptId: openCustom.interrupt_id,
          status: "resolved",
          // `choice_id`, not `choiceId` — `resolveDecisionResumeChoice` reads the
          // snake_case key and treats anything else as an ABSENT choice, which
          // resolves to DENY. Worth stating: the wrong key does not error, it
          // silently declines.
          payload: { choice_id: "approve_once" },
        },
      ],
    }),
  });
  const body = await res.text();
  const events = sse(body);
  const s3 = summarize(events);
  console.log("http", res.status, JSON.stringify(s3.counts));
  console.log("text:", JSON.stringify(s3.text.slice(0, 200)));
  if (!events.length) {
    console.log("raw:", body.slice(0, 800));
  }
  check("resume produced events", events.length > 0);
  check(
    "no RUN_ERROR on resume",
    !s3.counts.RUN_ERROR,
    JSON.stringify(events.filter((e) => e.type === "RUN_ERROR")).slice(0, 300)
  );
  check(
    "RUN_FINISHED exactly once",
    s3.counts.RUN_FINISHED === 1,
    `got ${s3.counts.RUN_FINISHED}`
  );
  // The point of the whole resume: the SUSPENDED tool got the user's answer and
  // returned. Without it the model just talks about an approval that never ran.
  // Per-MESSAGE text. `@ag-ui/mastra` splits text streamed AFTER a tool call into
  // a separate `<id>-agui-text` continuation message; if that continuation
  // REPEATS the first message instead of continuing it, the chat shows the answer
  // twice.
  const byMessage = new Map();
  for (const e of events) {
    if (e.type === "TEXT_MESSAGE_CONTENT") {
      byMessage.set(
        e.messageId,
        (byMessage.get(e.messageId) ?? "") + (e.delta ?? "")
      );
    }
  }
  for (const [id, t] of byMessage) {
    console.log(`  msg ${id}: ${JSON.stringify(t.slice(0, 150))}`);
  }
  // The ORDER decides whether the split is upstream's documented
  // trailing-text continuation or something re-emitting the same text.
  console.log(
    "  order:",
    events
      .filter((e) =>
        [
          "TEXT_MESSAGE_START",
          "TEXT_MESSAGE_END",
          "TOOL_CALL_START",
          "TOOL_CALL_RESULT",
        ].includes(e.type)
      )
      .map((e) =>
        e.type === "TOOL_CALL_START"
          ? `TOOL(${e.toolCallName})`
          : e.type === "TOOL_CALL_RESULT"
            ? "RESULT"
            : `${e.type === "TEXT_MESSAGE_START" ? "TXT+" : "TXT-"}${String(e.messageId).slice(-10)}`
      )
      .join(" ")
  );
  const texts = [...byMessage.values()];
  if (texts.length > 1) {
    const head = texts[0].slice(0, 40);
    check(
      "the continuation message does not repeat the first",
      !(head.length > 20 && texts[1].includes(head))
    );
  }

  const toolResult = events.find((e) => e.type === "TOOL_CALL_RESULT");
  console.log(
    "resumed tool result:",
    String(toolResult?.content ?? "").slice(0, 400)
  );
  check("the suspended tool produced a result", Boolean(toolResult));

  // ------------------------------------------------------------ 4. billing
  console.log("\n=== 4. the durable run rows ===");
  const runsRes = await fetch(`${AI}/ai/v1/runs?thread_id=${t2}&limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (runsRes.ok) {
    const rows = await runsRes.json();
    const list = Array.isArray(rows)
      ? rows
      : (rows.runs ?? rows.data ?? rows.items ?? []);
    // The LIST returns summaries; tokens ride `usage_json` on the single-run GET.
    const detailed = [];
    for (const row of list.slice(0, 4)) {
      const one = await fetch(`${AI}/ai/v1/runs/${row.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const detail = one.ok ? await one.json() : null;
      const run = detail?.run ?? detail;
      detailed.push(run);
      console.log(`  ${row.status} usage=${JSON.stringify(run?.usage_json)}`);
    }
    const billed = detailed.filter(
      (r) => Number(r?.usage_json?.input_tokens) > 0
    );
    check(
      "at least one run row carries tokens",
      billed.length > 0,
      "two cutovers in a row silently billed zero"
    );
  } else {
    console.log("  runs endpoint", runsRes.status, "— skipping");
  }
} else {
  console.log("\n=== 3. SKIPPED — no interrupt to resume ===");
}
