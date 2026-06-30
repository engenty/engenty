import { queryOptions } from "@engenty/query-client";
import { getMemberFieldDefinitions } from "./api.js";

export const teamGlobalSettingsKeys = {
  all: ["team", "global-settings"] as const,
  memberFieldDefinitions: () =>
    [...teamGlobalSettingsKeys.all, "member-field-definitions"] as const,
};

export function memberFieldDefinitionsQueryOptions() {
  return queryOptions({
    queryKey: teamGlobalSettingsKeys.memberFieldDefinitions(),
    queryFn: ({ signal }) => getMemberFieldDefinitions(signal),
  });
}
