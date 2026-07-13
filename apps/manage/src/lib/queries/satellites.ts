import { queryOptions } from "@engenty/query-client";
import { listSatellites } from "../api/satellites";

export const satellitesQuery = queryOptions({
  queryKey: ["manage", "satellites"],
  queryFn: ({ signal }) => listSatellites(signal),
});
