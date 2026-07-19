import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import {
  createSecret,
  deleteSecret,
  listClients,
  listProjects,
  listSecrets,
  moveSecret,
  type OwnerScope,
  type SecretCreateInput,
  type SecretUpdateInput,
  updateSecret,
} from "./api.js";

export const secretsKeys = {
  all: ["secrets"] as const,
  list: () => [...secretsKeys.all, "list"] as const,
  clients: () => [...secretsKeys.all, "clients"] as const,
  projects: () => [...secretsKeys.all, "projects"] as const,
};

export function useSecretsQuery() {
  return useQuery(
    queryOptions({
      queryKey: secretsKeys.list(),
      queryFn: ({ signal }) => listSecrets(signal),
    })
  );
}

export function useClientsQuery() {
  return useQuery(
    queryOptions({
      queryKey: secretsKeys.clients(),
      queryFn: ({ signal }) => listClients(signal),
      staleTime: 60_000,
    })
  );
}

export function useProjectsQuery() {
  return useQuery(
    queryOptions({
      queryKey: secretsKeys.projects(),
      queryFn: ({ signal }) => listProjects(signal),
      staleTime: 60_000,
    })
  );
}

function useInvalidateSecrets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: secretsKeys.list() });
}

export function useCreateSecretMutation() {
  const invalidate = useInvalidateSecrets();
  return useMutation({
    mutationFn: (input: SecretCreateInput) => createSecret(input),
    onSuccess: invalidate,
  });
}

export function useUpdateSecretMutation() {
  const invalidate = useInvalidateSecrets();
  return useMutation({
    mutationFn: async (args: {
      update: SecretUpdateInput;
      move?: { owner_scope: OwnerScope; owner_id: string };
    }) => {
      await updateSecret(args.update);
      if (args.move) {
        await moveSecret({ id: args.update.id, ...args.move });
      }
    },
    onSuccess: invalidate,
  });
}

export function useDeleteSecretMutation() {
  const invalidate = useInvalidateSecrets();
  return useMutation({
    mutationFn: (id: string) => deleteSecret(id),
    onSuccess: invalidate,
  });
}
