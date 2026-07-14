import { keepPreviousData, queryOptions } from "@engenty/query-client";
import {
  type LogEntriesParams,
  listLogEntries,
  listLogFiles,
} from "../api/logs";

export const logFilesQuery = queryOptions({
  queryKey: ["manage", "logs", "files"],
  queryFn: ({ signal }) => listLogFiles(signal),
});

export function logEntriesQuery(params: LogEntriesParams) {
  return queryOptions({
    queryKey: ["manage", "logs", "entries", params],
    queryFn: ({ signal }) => listLogEntries(params, signal),
    enabled: Boolean(params.date),
    // Keep the previous page visible while the next one loads so paging and
    // filter tweaks don't flash the empty/loading state.
    placeholderData: keepPreviousData,
  });
}
