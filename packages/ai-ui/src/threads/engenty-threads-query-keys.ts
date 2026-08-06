import { appsAiThreadsListQueryKey } from "../ag-ui/apps-ai/apps-ai-thread-api.js";
import { resolveEngentyThreadHostProfile } from "./thread-host-profile.js";

export function engentyThreadsListQueryKey(params: {
  hostKey: string;
  includeArchived?: boolean;
  serviceBaseUrl: string;
  agentId?: string | null;
}) {
  const profile = resolveEngentyThreadHostProfile(
    params.hostKey,
    params.agentId
  );
  return appsAiThreadsListQueryKey({
    agentId: profile.agentId,
    hostKey: profile.hostKey,
    includeArchived: params.includeArchived,
    serviceBaseUrl: params.serviceBaseUrl,
  });
}
