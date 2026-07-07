import { requestApiJson } from "@engenty/api-client";
import { useQuery } from "@engenty/query-client";
import { listUsers } from "@engenty/user-management-ui";

interface TeamMemberBrief {
  full_name: string;
  id: string;
  user_id: string | null;
}

export function useUserListQuery() {
  return useQuery({
    queryKey: ["users", "list", "with-team"],
    queryFn: async () => {
      const [users, teamMembers] = await Promise.all([
        listUsers(),
        requestApiJson<TeamMemberBrief[]>("/api/team?pageSize=1000").catch(
          () => [] as TeamMemberBrief[]
        ),
      ]);

      return users.map((user) => {
        const teamMember = teamMembers.find((m) => m.user_id === user.id);
        return {
          ...user,
          teamMember: teamMember ?? null,
        };
      });
    },
    staleTime: 60_000,
  });
}
