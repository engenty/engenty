import { queryOptions } from "@engenty/query-client";
import { listPendingApprovals } from "../api/approvals";

export const pendingApprovalsQuery = queryOptions({
  queryKey: ["manage", "approvals", "pending"],
  queryFn: ({ signal }) => listPendingApprovals(signal),
  // Approvals expire (5min TTL in core); refresh so the queue stays live.
  refetchInterval: 15_000,
});
