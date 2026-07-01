/**
 * Knowledge Base — TanStack Query options.
 */

import { queryOptions } from "@engenty/query-client";
import { getKbSettings } from "../api.js";

/* ── Settings ── */

export const kbSettingsQueryOptions = queryOptions({
  queryKey: ["kb", "settings"],
  queryFn: ({ signal }) => getKbSettings(signal),
  staleTime: 60_000,
});
