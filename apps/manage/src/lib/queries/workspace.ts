import { queryOptions } from "@engenty/query-client";
import { getWorkspaceContext } from "../api/workspace";

export const workspaceContextQuery = queryOptions({
  queryKey: ["manage", "workspace-context"],
  queryFn: ({ signal }) => getWorkspaceContext(signal),
});
