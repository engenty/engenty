import { queryOptions } from "@engenty/query-client";
import { getEnvVars } from "../api/settings";

export const envVarsQuery = queryOptions({
  queryKey: ["manage", "settings", "env"],
  queryFn: ({ signal }) => getEnvVars(signal),
});
