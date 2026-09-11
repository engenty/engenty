/**
 * AG-UI compatibility probe.
 *
 * Points a STOCK `HttpAgent` from @ag-ui/client at our existing run endpoint and
 * records what happens. No CopilotKit, no @ag-ui/mastra, no engenty imports —
 * that is the point: if this file needed anything of ours to work, our wire
 * would not be canonical.
 *
 * Usage:  node packages/ag-ui-bridge/live-probes/stock-client.mjs
 */
import { HttpAgent } from "@ag-ui/client";
import { aiBaseUrl, createThread, env, signIn } from "./probe-env.mjs";

const E = env();
const AI = aiBaseUrl(E);

const log = (...a) => console.log(...a);
const results = [];
function probe(id, ok, detail) {
  results.push({ id, ok, detail });
  log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail ?? ""}`);
}

/** Collect every event a stock HttpAgent run produces. */
async function runAndCollect(token, threadId, prompt, { abortAfter } = {}) {
  const agent = new HttpAgent({
    url: `${AI}/ai/v1/threads/${threadId}/runs`,
    headers: { Authorization: `Bearer ${token}` },
    threadId,
  });
  // `messages` is AGENT STATE in AG-UI, not a runAgent() parameter — RunAgentParameters
  // is Pick<RunAgentInput, "runId"|"tools"|"context"|"forwardedProps"> + resume. Setting
  // it on the instance is the canonical way to carry the turn.
  agent.messages = [{ id: crypto.randomUUID(), role: "user", content: prompt }];
  const seen = [];
  let aborted = false;
  const sub = {
    onEvent: ({ event }) => {
      seen.push(event);
      if (abortAfter && seen.length >= abortAfter && !aborted) {
        aborted = true;
        agent.abortRun();
      }
    },
  };
  try {
    await agent.runAgent({ runId: crypto.randomUUID() }, sub);
  } catch (err) {
    seen.push({
      type: "__CLIENT_THREW__",
      message: String(err?.message ?? err),
    });
  }
  return { seen, agent };
}

const types = (seen) => seen.map((e) => e.type);

async function main() {
  log("— AG-UI HttpAgent probe —\n");
  const token = await signIn(E);
  log("signed in\n");

  // ---- P1: wire baseline -------------------------------------------------
  const threadId = await createThread(
    AI,
    token,
    "engenty.copilot",
    "agui probe"
  );
  log(`thread ${threadId}\n`);
  const { seen } = await runAndCollect(
    token,
    threadId,
    "Say exactly: hello from the probe."
  );
  const t = types(seen);
  log("events:", JSON.stringify(t, null, 0), "\n");

  probe(
    "P1 lifecycle",
    t.includes("RUN_STARTED") &&
      (t.includes("RUN_FINISHED") || t.includes("RUN_ERROR")),
    `${t.length} events`
  );

  const textTriple =
    t.includes("TEXT_MESSAGE_START") &&
    t.includes("TEXT_MESSAGE_CONTENT") &&
    t.includes("TEXT_MESSAGE_END");
  probe(
    "P3 text triple accepted by stock client",
    textTriple,
    textTriple ? "" : "no triple seen"
  );

  const text = seen
    .filter((e) => e.type === "TEXT_MESSAGE_CONTENT")
    .map((e) => e.delta ?? "")
    .join("");
  probe(
    "P1 text assembles",
    text.trim().length > 0,
    JSON.stringify(text.slice(0, 80))
  );

  // ---- P2: tool call -----------------------------------------------------
  const toolThread = await createThread(
    AI,
    token,
    "engenty.copilot",
    "agui probe"
  );
  const { seen: seen2 } = await runAndCollect(
    token,
    toolThread,
    "Create a task titled 'agui probe task'. Do it now by calling the appropriate tool."
  );
  const t2 = types(seen2);
  log("\ntool-run events:", JSON.stringify(t2, null, 0), "\n");
  const customNames = [
    ...new Set(
      [...seen, ...seen2].filter((e) => e.type === "CUSTOM").map((e) => e.name)
    ),
  ];
  log("CUSTOM event names seen:", JSON.stringify(customNames), "\n");
  probe(
    "P2 tool call round-trips",
    t2.includes("TOOL_CALL_START") && t2.includes("TOOL_CALL_END"),
    t2.filter((x) => x.startsWith("TOOL_CALL")).join(",") ||
      "no TOOL_CALL_* seen"
  );

  // ---- P4: reconnect (expected to fail — measuring the gap) --------------
  const rcThread = await createThread(
    AI,
    token,
    "engenty.copilot",
    "agui probe"
  );
  const { seen: seen3 } = await runAndCollect(
    token,
    rcThread,
    "Count slowly from 1 to 30, one number per line.",
    {
      abortAfter: 6,
    }
  );
  const t3 = types(seen3);
  const sawTerminal = t3.includes("RUN_FINISHED") || t3.includes("RUN_ERROR");
  log(
    `\nreconnect-run: ${t3.length} events before abort, terminal seen: ${sawTerminal}`
  );
  probe(
    "P4 stock client can resume a dropped stream",
    false,
    "by construction: HttpAgent has no since/lastEventId. Gap measured below."
  );

  // Can the run still be reached out-of-band? That is OUR capability.
  const runId = seen3.find((e) => e.type === "RUN_STARTED")?.runId;
  if (runId) {
    const r = await fetch(`${AI}/ai/v1/runs/${runId}/stream?since=-1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await r.text();
    const replayed = (body.match(/^data:/gm) ?? []).length;
    probe(
      "P4b run survives the drop and replays from the log",
      r.ok && replayed >= t3.length,
      `replayed ${replayed} events vs ${t3.length} seen live (runId ${runId})`
    );
  } else {
    probe(
      "P4b run survives the drop",
      false,
      "no runId captured from RUN_STARTED"
    );
  }

  log("\n— summary —");
  for (const r of results) {
    log(`${r.ok ? "PASS" : "FAIL"}  ${r.id}  ${r.detail ?? ""}`);
  }
}

main().catch((e) => {
  console.error("\nSPIKE ERROR:", e);
  process.exit(1);
});
