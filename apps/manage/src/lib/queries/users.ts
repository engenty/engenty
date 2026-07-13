import { queryOptions } from "@engenty/query-client";
import { getUser, listUsers } from "../api/users";

export const usersQuery = queryOptions({
  queryKey: ["manage", "users"],
  queryFn: ({ signal }) => listUsers(signal),
});

export const userQuery = (id: string) =>
  queryOptions({
    queryKey: ["manage", "users", id],
    queryFn: ({ signal }) => getUser(id, signal),
  });
