/**
 * Knowledge Base — UI API client.
 */

import { requestApiJson } from "@engenty/api-client";
import type { KbGraphData } from "../../src/schema/types.js";

const API = "/api/kb";

/* ── Graph ── */

export async function getKbGraph(
  kbId: string,
  signal?: AbortSignal
): Promise<KbGraphData> {
  return requestApiJson<KbGraphData>(
    `${API}/graph?kb_id=${encodeURIComponent(kbId)}`,
    { method: "GET", signal }
  );
}
