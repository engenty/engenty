// A run started from a conversation ("run it now", invoke_workflow) answers
// back in that conversation: the summary plus the stored result as an
// artifact card, which opens the result in the side pane. Without it the
// person who asked saw "started" and then nothing — the result landed in a
// log they were not looking at.

import { createLogger } from "@engenty/telemetry";
import { createThreadStoreFromEnv } from "../index.js";
import {
  type ArtifactTeaser,
  artifactTeaserPart,
} from "../threads/artifact-teaser.js";
import { stableUuid } from "./dispatch-published-run.js";

const logger = createLogger({ name: "apps/ai/run-report-to-caller" });

export async function reportRunToCaller(input: {
  artifact: ArtifactTeaser | null;
  callerThreadId: string;
  name: string | null;
  reason: string | null;
  runId: string;
  status: "completed" | "failed";
  summary: string | null;
  tenantId: string;
}): Promise<void> {
  const store = createThreadStoreFromEnv();
  if (!store) {
    return;
  }
  const heading = input.name ? `**${input.name}**\n\n` : "";
  const text =
    input.status === "failed"
      ? `${heading}Run failed${input.reason?.trim() ? `: ${input.reason.trim()}` : "."}`
      : `${heading}${input.summary?.trim() || "Finished."}`;
  try {
    await store.appendMessage({
      authorUserId: null,
      // Replayed settles upsert instead of answering twice.
      id: stableUuid(`run-result:${input.runId}`),
      metadata: { run_id: input.runId, source: "run-result" },
      parts: [
        { text, type: "text" },
        ...(input.artifact && input.status === "completed"
          ? [artifactTeaserPart(input.artifact)]
          : []),
      ],
      role: "assistant",
      tenantId: input.tenantId,
      threadId: input.callerThreadId,
    });
  } catch (error) {
    logger.warn("run result to caller failed", {
      error: error instanceof Error ? error.message : String(error),
      runId: input.runId,
    });
  }
}
