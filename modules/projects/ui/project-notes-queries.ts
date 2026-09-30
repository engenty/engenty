import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import {
  createProjectNote,
  deleteProjectNote,
  getProjectNotes,
  type ProjectNote,
  type ProjectNoteInput,
  updateProjectNote,
} from "./api.js";
import { projectKeys } from "./queries.js";

export const projectNotesKey = (projectId: string) =>
  [...projectKeys.all, "notes", projectId] as const;

export function projectNotesOptions(projectId: string) {
  return queryOptions({
    queryKey: projectNotesKey(projectId),
    queryFn: async ({ signal }) =>
      (await getProjectNotes(projectId, signal)).notes,
  });
}

export function useProjectNotesQuery(projectId: string) {
  return useQuery(projectNotesOptions(projectId));
}

function useNotesCache(projectId: string) {
  const queryClient = useQueryClient();
  const key = projectNotesKey(projectId);
  return {
    set: (update: (notes: ProjectNote[]) => ProjectNote[]) =>
      queryClient.setQueryData<ProjectNote[]>(key, (prev) =>
        update(prev ?? [])
      ),
    invalidate: () => queryClient.invalidateQueries({ queryKey: key }),
  };
}

export function useCreateProjectNoteMutation(projectId: string) {
  const cache = useNotesCache(projectId);
  return useMutation({
    mutationFn: (input: ProjectNoteInput) =>
      createProjectNote(projectId, input),
    onSuccess: (created) => cache.set((notes) => [...notes, created]),
  });
}

/** Saves a page; the cache takes the patch up front so the page list follows the title. */
export function useUpdateProjectNoteMutation(projectId: string) {
  const cache = useNotesCache(projectId);
  return useMutation({
    mutationFn: ({
      noteId,
      patch,
    }: {
      noteId: string;
      patch: ProjectNoteInput;
    }) => updateProjectNote(projectId, noteId, patch),
    onMutate: ({ noteId, patch }) =>
      cache.set((notes) =>
        notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n))
      ),
    onError: () => cache.invalidate(),
  });
}

export function useDeleteProjectNoteMutation(projectId: string) {
  const cache = useNotesCache(projectId);
  return useMutation({
    mutationFn: (noteId: string) => deleteProjectNote(projectId, noteId),
    onMutate: (noteId) =>
      cache.set((notes) => notes.filter((n) => n.id !== noteId)),
    onError: () => cache.invalidate(),
  });
}
