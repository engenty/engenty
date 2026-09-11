/**
 * Link search backends for the article editor selection bubble.
 * Registers “this KB” and “other KBs” article search.
 */

import type { LinkSearchHit, LinkSearchSource } from "@engenty/tiptap-editor";
import type { KnowledgeBase } from "../../src/schema/types.js";
import { listArticles } from "../api.js";
import { kbArticlePath } from "../kb-paths.js";

export function createKbArticleLinkBubbleSources(opts: {
  kbs: KnowledgeBase[];
  currentKbId: string;
  labels: { otherKbs: string; thisKb: string };
}): LinkSearchSource[] {
  const { kbs, currentKbId, labels } = opts;
  const slugByKbId = new Map(kbs.map((k) => [k.id, k.slug]));

  const thisKb: LinkSearchSource = {
    id: "kb-this",
    label: labels.thisKb,
    search: async (query, signal) => {
      const q = query.trim();
      if (q.length < 2) {
        return [];
      }
      const { data } = await listArticles(
        {
          kb_id: currentKbId,
          search: q,
          page_size: 20,
          search_fts: true,
        },
        signal
      );
      return data.map(
        (a): LinkSearchHit => ({
          id: a.id,
          title: a.title,
          subtitle: a.slug,
          href: kbArticlePath(a.id),
        })
      );
    },
  };

  const otherKbs = kbs.filter((k) => k.id !== currentKbId);
  if (otherKbs.length === 0) {
    return [thisKb];
  }

  const other: LinkSearchSource = {
    id: "kb-other",
    label: labels.otherKbs,
    search: async (query, signal) => {
      const q = query.trim();
      if (q.length < 2) {
        return [];
      }
      const hits: LinkSearchHit[] = [];
      for (const kb of otherKbs) {
        if (signal.aborted) {
          break;
        }
        const { data } = await listArticles(
          {
            kb_id: kb.id,
            search: q,
            page_size: 12,
            search_fts: true,
          },
          signal
        );
        const slug = slugByKbId.get(kb.id) ?? kb.slug;
        for (const a of data) {
          hits.push({
            id: `${kb.id}:${a.id}`,
            title: a.title,
            subtitle: `${kb.name} · ${a.slug}`,
            href: kbArticlePath(a.id),
          });
        }
      }
      return hits.slice(0, 30);
    },
  };

  return [thisKb, other];
}
