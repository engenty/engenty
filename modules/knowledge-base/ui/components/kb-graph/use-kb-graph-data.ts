/**
 * Builds a Graphology MultiGraph from KB graph API data.
 * Layout is applied synchronously with ForceAtlas2 before returning
 * so Sigma receives a fully-positioned graph.
 */

import { useQuery } from "@engenty/query-client";
import MultiGraph from "graphology";
import circular from "graphology-layout/circular";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { useMemo } from "react";
import type { KbGraphTag } from "../../../src/schema/types.js";
import { kbGraphQueryOptions } from "../../queries.js";

export interface KbGraphDataResult {
  error: Error | null;
  filteredNodeCount: number;
  graph: MultiGraph | null;
  isLoading: boolean;
  /** True while refetching graph payload from the API (rebuild edges + layout). */
  isRefetching: boolean;
  nodeCount: number;
  /** Refetch `/api/kb/graph` and rebuild the Graphology graph from fresh nodes/links. */
  refetch: () => void;
  tags: KbGraphTag[];
}

/* ── Colour helpers ── */

/** Muted neutral for articles with no tags. */
const UNTAGGED_COLOR = "#64748b";

const TAG_PALETTE = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ec4899",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#0ea5e9",
];

function resolveTagColor(tag: KbGraphTag, index: number): string {
  return tag.color ?? TAG_PALETTE[index % TAG_PALETTE.length];
}

/* ── Graph build ── */

export interface KbGraphFilter {
  search: string;
  statusFilter: "all" | "draft" | "published" | "archived";
  tagFilter: string[];
}

export function useKbGraphData(
  kbId: string,
  filter: KbGraphFilter
): KbGraphDataResult {
  const { data, isLoading, error, refetch, isFetching } = useQuery(
    kbGraphQueryOptions(kbId)
  );

  const tagColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const [i, tag] of (data?.tags ?? []).entries()) {
      map.set(tag.id, resolveTagColor(tag, i));
    }
    return map;
  }, [data?.tags]);

  const { graph, filteredNodeCount } = useMemo(() => {
    if (!data?.nodes.length) {
      return { graph: null, filteredNodeCount: 0 };
    }

    const { search, statusFilter, tagFilter } = filter;
    const searchLower = search.trim().toLowerCase();

    // Filter nodes
    const visibleNodes = data.nodes.filter((n) => {
      if (statusFilter !== "all" && n.status !== statusFilter) {
        return false;
      }
      if (
        tagFilter.length > 0 &&
        !tagFilter.some((tid) => n.tag_ids.includes(tid))
      ) {
        return false;
      }
      if (searchLower && !n.title.toLowerCase().includes(searchLower)) {
        return false;
      }
      return true;
    });

    const visibleIds = new Set(visibleNodes.map((n) => n.id));

    const g = new MultiGraph();

    for (const node of visibleNodes) {
      // Color by tag group — first tag wins, untagged nodes are muted neutral
      let color = UNTAGGED_COLOR;
      for (const tid of node.tag_ids) {
        const tc = tagColorMap.get(tid);
        if (tc) {
          color = tc;
          break;
        }
      }
      const isRoot = !node.parent_article_id;
      g.addNode(node.id, {
        label: node.title,
        slug: node.slug,
        status: node.status,
        sort_order: node.sort_order ?? 0,
        size: isRoot ? 10 : 6,
        color,
        x: Math.random(),
        y: Math.random(),
      });
    }

    // Tree edges — only between visible nodes
    for (const node of visibleNodes) {
      if (node.parent_article_id && visibleIds.has(node.parent_article_id)) {
        g.addEdge(node.parent_article_id, node.id, {
          kind: "tree",
          size: 2.5,
          color: "#94a3b8",
        });
      }
    }

    // Inline body links (TipTap link marks → `/mdl/knowledge-base/kb/.../:id`)
    for (const link of data?.inline_links ?? []) {
      const from = link.from_article_id;
      const to = link.to_article_id;
      if (!(visibleIds.has(from) && visibleIds.has(to))) {
        continue;
      }
      const edgeKey = `inline:${from}->${to}`;
      if (g.hasEdge(edgeKey)) {
        continue;
      }
      try {
        g.addEdge(
          from,
          to,
          {
            kind: "inline",
            size: 2.2,
            color: "#a78bfa",
          },
          edgeKey
        );
      } catch {
        /* duplicate or invalid extremities */
      }
    }

    // When there is no hierarchy, show tag affinity so flat KBs are still connected.
    const n = visibleNodes.length;
    const allowTagAffinity = n > 1 && n <= 120;
    if (allowTagAffinity) {
      for (let i = 0; i < visibleNodes.length; i++) {
        const a = visibleNodes[i];
        if (!a.tag_ids.length) {
          continue;
        }
        for (let j = i + 1; j < visibleNodes.length; j++) {
          const b = visibleNodes[j];
          if (!b.tag_ids.length) {
            continue;
          }
          const sharesTag = a.tag_ids.some((tid) => b.tag_ids.includes(tid));
          if (!sharesTag) {
            continue;
          }
          const alreadyLinked = g.hasEdge(a.id, b.id) || g.hasEdge(b.id, a.id);
          if (alreadyLinked) {
            continue;
          }
          g.addEdge(a.id, b.id, {
            kind: "tag",
            size: 1.8,
            color: "#64748b",
          });
        }
      }
    }

    /**
     * Flat KBs often have no `parent_article_id`, no inline `link` hrefs to other
     * articles, and no tag pairs — which yields zero edges and looks “broken”.
     * Connect consecutive articles in sidebar order (`sort_order`) so the graph
     * always has a spine when there are 2+ visible nodes.
     */
    if (g.size === 0 && visibleNodes.length > 1) {
      const sorted = [...visibleNodes].sort((a, b) => {
        const d = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (d !== 0) {
          return d;
        }
        return a.title.localeCompare(b.title);
      });
      for (let i = 0; i < sorted.length - 1; i++) {
        const u = sorted[i].id;
        const v = sorted[i + 1].id;
        const edgeKey = `spine:${u}->${v}`;
        try {
          g.addEdge(
            u,
            v,
            {
              kind: "spine",
              size: 1.5,
              color: "#64748b",
            },
            edgeKey
          );
        } catch {
          /* duplicate key / invalid */
        }
      }
    }

    if (g.order === 0) {
      return { graph: g, filteredNodeCount: 0 };
    }

    // Initial positions: circular layout for stable start
    circular.assign(g);

    // ForceAtlas2 synchronous layout
    const iterations = Math.min(500, Math.max(200, g.order * 3));
    forceAtlas2.assign(g, {
      iterations,
      settings: {
        gravity: 1,
        scalingRatio: 8,
        strongGravityMode: false,
        linLogMode: false,
        barnesHutOptimize: g.order > 100,
      },
    });

    return { graph: g, filteredNodeCount: visibleNodes.length };
  }, [data, filter, tagColorMap]);

  return {
    filteredNodeCount,
    graph,
    isLoading,
    isRefetching: isFetching && !isLoading,
    error: (error ?? null) as Error | null,
    refetch: () => {
      void refetch();
    },
    tags: data?.tags ?? [],
    nodeCount: data?.nodes.length ?? 0,
  };
}
