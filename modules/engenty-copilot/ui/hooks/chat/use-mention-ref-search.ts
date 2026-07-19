// Typed @-mention search for the composer: tenant people (core users) plus
// cross-module objects via the user-scoped workspace search. Each result
// carries a canonical ObjectRef (`<module>:<entity>:<id>` / `core:user:<id>`)
// so the server seam and the object-widget chips can resolve it.

import type { MentionRefCandidate, MentionRefSearch } from "@engenty/ai-ui";
import { requestApiJson } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useCallback, useRef } from "react";

interface CoreUserRecord {
  display_name: string | null;
  email: string;
  id: string;
}

interface WorkspaceSearchMatch {
  doc_id: string;
  module: string;
  source_type: string;
  title: string | null;
}

/** The search response wraps each match as `{ item, score, … }`. */
function unwrapWorkspaceSearchMatch(raw: unknown): WorkspaceSearchMatch | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const container = raw as { item?: unknown };
  const item = (container.item ?? raw) as Partial<WorkspaceSearchMatch>;
  if (typeof item.doc_id !== "string" || typeof item.module !== "string") {
    return null;
  }
  return {
    doc_id: item.doc_id,
    module: item.module,
    source_type:
      typeof item.source_type === "string" ? item.source_type : item.module,
    title: typeof item.title === "string" ? item.title : null,
  };
}

const PEOPLE_LIMIT = 4;
const OBJECT_LIMIT = 8;

function userMatches(user: CoreUserRecord, query: string): boolean {
  const q = query.toLowerCase();
  return (
    (user.display_name ?? "").toLowerCase().includes(q) ||
    user.email.toLowerCase().includes(q)
  );
}

/** `contacts.contact` → `contacts:contact` (ObjectRef entity key). */
function entityKeyFromSourceType(module: string, sourceType: string): string {
  const entity = sourceType.startsWith(`${module}.`)
    ? sourceType.slice(module.length + 1)
    : sourceType;
  return `${module}:${entity}`;
}

export function useMentionRefSearch(): MentionRefSearch {
  const { t } = useTranslation("engenty-copilot");
  // Tenant user lists are small — fetch once per session and filter locally.
  const usersRef = useRef<CoreUserRecord[] | null>(null);
  const peopleGroup = t("chat.mentions.people", { defaultValue: "People" });
  const objectsGroup = t("chat.mentions.objects", {
    defaultValue: "Workspace",
  });

  return useCallback<MentionRefSearch>(
    async (query) => {
      const trimmed = query.trim();
      const [users, objects] = await Promise.all([
        (async () => {
          try {
            if (!usersRef.current) {
              usersRef.current =
                await requestApiJson<CoreUserRecord[]>("/api/users");
            }
            return usersRef.current;
          } catch {
            return [] as CoreUserRecord[];
          }
        })(),
        (async () => {
          if (!trimmed) {
            return [] as WorkspaceSearchMatch[];
          }
          try {
            const response = await requestApiJson<{ matches?: unknown[] }>(
              "/api/workspace-search",
              {
                body: { limit: OBJECT_LIMIT, query: trimmed },
                method: "POST",
              }
            );
            return (response.matches ?? [])
              .map(unwrapWorkspaceSearchMatch)
              .filter((m): m is WorkspaceSearchMatch => m !== null);
          } catch {
            return [] as WorkspaceSearchMatch[];
          }
        })(),
      ]);

      const people: MentionRefCandidate[] = users
        .filter((user) => !trimmed || userMatches(user, trimmed))
        .slice(0, PEOPLE_LIMIT)
        .map((user) => ({
          entity: "core:user",
          group: peopleGroup,
          label: user.display_name || user.email,
          ref: `core:user:${user.id}`,
          sublabel: user.email,
        }));

      const seenRefs = new Set<string>();
      const objectCandidates: MentionRefCandidate[] = [];
      for (const match of objects) {
        const entity = entityKeyFromSourceType(match.module, match.source_type);
        const ref = `${entity}:${match.doc_id}`;
        if (seenRefs.has(ref) || !match.title) {
          continue;
        }
        seenRefs.add(ref);
        objectCandidates.push({
          entity,
          group: objectsGroup,
          label: match.title,
          ref,
          sublabel: entity,
        });
      }

      return [...people, ...objectCandidates];
    },
    [objectsGroup, peopleGroup]
  );
}
