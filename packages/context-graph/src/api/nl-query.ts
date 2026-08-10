// Natural-language → graph query. Two LLM calls bracket a deterministic
// traversal: (1) translate the question into a structured query plan against
// the registered ontology, (2) execute the plan with a breadth-first multi-hop
// traversal over the DAL, (3) phrase a short answer from the resolved results.
// The traversal itself is deterministic — the model never invents graph data.

import { resolveChatModelId } from "@engenty/ai-core";
import { z } from "@hono/zod-openapi";
import { generateText } from "ai";
import type { EntityRow } from "../contracts.js";
import type { ContextGraphServerApi } from "../server-api.js";

const MAX_RESULT_NODES = 400;

export const askResponseSchema = z.object({
  answer: z.string(),
  edgeIds: z.array(z.string()),
  nodeIds: z.array(z.string()),
  // Echo the resolved plan so the UI can show what was interpreted.
  interpretation: z.object({
    anchors: z.array(z.string()),
    depth: z.number(),
    direction: z.string(),
    edgeType: z.string().nullable(),
    mode: z.string(),
  }),
});

export type AskResponse = z.infer<typeof askResponseSchema>;

const planSchema = z.object({
  anchors: z
    .array(z.object({ name: z.string(), type: z.string().nullish() }))
    .default([]),
  depth: z.number().int().min(1).max(6).default(1),
  direction: z.enum(["out", "in", "any"]).default("any"),
  edgeType: z.string().nullish(),
  // For "rank" mode: restrict the ranked entities to this type, and how many to return.
  entityType: z.string().nullish(),
  limit: z.number().int().min(1).max(25).default(5),
  mode: z.enum(["traverse", "path", "lookup", "rank"]).default("traverse"),
  understood: z.boolean().default(true),
});

type Plan = z.infer<typeof planSchema>;

function stripFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Score how well a stored entity name matches a free-text query fragment. */
function nameScore(query: string, name: string | null): number {
  if (!name) {
    return 0;
  }
  const q = query.trim().toLowerCase();
  const n = name.toLowerCase();
  if (!q) {
    return 0;
  }
  if (n === q) {
    return 4;
  }
  if (n.startsWith(q)) {
    return 3;
  }
  if (n.includes(q)) {
    return 2;
  }
  const qTokens = q.split(/\s+/).filter(Boolean);
  const overlap = qTokens.filter((t) => n.includes(t)).length;
  return overlap > 0 ? overlap / qTokens.length : 0;
}

function resolveAnchor(
  entities: EntityRow[],
  name: string,
  type?: string | null
): EntityRow | null {
  let best: EntityRow | null = null;
  let bestScore = 0;
  for (const e of entities) {
    if (type && e.type !== type) {
      continue;
    }
    const s = nameScore(name, e.name);
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  return bestScore > 0 ? best : null;
}

interface OntologyForPrompt {
  edgeTypes: {
    id: string;
    displayName: string;
    subjectTypes: readonly string[];
    objectTypes: readonly string[];
  }[];
  entityTypes: { id: string; displayName: string }[];
}

async function planQuery(
  question: string,
  ontology: OntologyForPrompt
): Promise<Plan> {
  const prompt = [
    "You translate a natural-language question about an organisation/knowledge graph into a JSON query plan. Return ONLY valid JSON, no markdown.",
    "",
    "The graph has typed entities and directed edges. An edge goes subject --type--> object.",
    "Direction meaning relative to an anchor entity:",
    '- "out": follow edges where the anchor is the SUBJECT (anchor --edge--> others).',
    '- "in": follow edges where the anchor is the OBJECT (others --edge--> anchor).',
    '- "any": follow both.',
    "",
    'Example: edge "team.reports_to" means subject reports_to object (a person reports to their manager).',
    '- "who reports to X" → anchor X, edgeType team.reports_to, direction "in" (others point to X).',
    '- "who does X report to" / "X\'s manager" → anchor X, direction "out".',
    '- "X\'s whole org / everyone under X" → direction "in", depth 5+ for transitive traversal.',
    '- "how is X connected to Y" / "path between X and Y" → mode "path", anchors [X, Y].',
    "",
    'Aggregation / ranking questions have NO specific anchor — use mode "rank":',
    '- "who has the most team members / direct reports" → mode "rank", edgeType team.reports_to, direction "in" (count entities that are the OBJECT of the edge), limit 5.',
    '- "who reports to the most people" → mode "rank", direction "out" (count by SUBJECT).',
    '- "which organisation has the most contacts" → mode "rank" with the relevant edgeType, set entityType to the type being ranked.',
    'For "rank", count edges of edgeType: direction "in" ranks by how many edges point TO each entity, "out" by how many point FROM it. anchors stays empty.',
    "",
    "Output shape:",
    '{"understood": true, "mode": "traverse"|"path"|"lookup"|"rank", "anchors": [{"name": "...", "type": "<entityTypeId or omit>"}], "edgeType": "<edgeTypeId or null>", "direction": "out"|"in"|"any", "depth": <1-6>, "entityType": "<entityTypeId or null>", "limit": <1-25>}',
    "",
    "Rules:",
    '- anchors[].name is the proper name as written by the user (e.g. "Gruber"). The server resolves it to an entity.',
    "- edgeType must be one of the edge type ids below, or null to follow any edge.",
    "- Use depth 1 for direct relationships; higher only when the question implies transitive/multi-hop.",
    '- mode "lookup" = just find the anchor entity and show its immediate connections (depth 1, direction any).',
    '- mode "rank" needs an edgeType and a direction; anchors empty. Use limit to control how many leaders to return (default 5, use 1 for "who has the most").',
    "- If the question cannot be answered from this graph, set understood=false.",
    "",
    `Entity types: ${JSON.stringify(ontology.entityTypes)}`,
    `Edge types: ${JSON.stringify(ontology.edgeTypes)}`,
    "",
    `Question: ${JSON.stringify(question)}`,
  ].join("\n");

  const result = await generateText({
    model: resolveChatModelId({ purpose: "routing" }),
    prompt,
    telemetry: { isEnabled: true },
  });
  const parsed = planSchema.parse(JSON.parse(stripFences(result.text)));
  return parsed;
}

interface TraversalResult {
  edgeIds: string[];
  foundIds: string[];
  nodeIds: string[];
}

/** Breadth-first multi-hop traversal from the anchors along the plan's edges. */
async function traverse(
  api: ContextGraphServerApi,
  tenantId: string,
  anchorIds: string[],
  plan: Plan
): Promise<TraversalResult> {
  const visited = new Set<string>(anchorIds);
  const edgeIds = new Set<string>();
  const found = new Set<string>(); // discovered (non-anchor) nodes
  let frontier = [...anchorIds];

  for (let hop = 0; hop < plan.depth && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const node of frontier) {
      const batches: Promise<{
        rows: { id: string; subject_id: string; object_id: string }[];
        otherKey: "subject_id" | "object_id";
      }>[] = [];
      if (plan.direction === "out" || plan.direction === "any") {
        batches.push(
          api
            .listEdges({
              tenantId,
              fromEntityId: node,
              type: plan.edgeType ?? undefined,
            })
            .then((rows) => ({ rows, otherKey: "object_id" as const }))
        );
      }
      if (plan.direction === "in" || plan.direction === "any") {
        batches.push(
          api
            .listEdges({
              tenantId,
              toEntityId: node,
              type: plan.edgeType ?? undefined,
            })
            .then((rows) => ({ rows, otherKey: "subject_id" as const }))
        );
      }
      const results = await Promise.all(batches);
      for (const { rows, otherKey } of results) {
        for (const e of rows) {
          edgeIds.add(e.id);
          const other = e[otherKey];
          if (!visited.has(other)) {
            visited.add(other);
            found.add(other);
            next.push(other);
            if (visited.size >= MAX_RESULT_NODES) {
              break;
            }
          }
        }
      }
      if (visited.size >= MAX_RESULT_NODES) {
        break;
      }
    }
    frontier = next;
  }

  return { edgeIds: [...edgeIds], foundIds: [...found], nodeIds: [...visited] };
}

/** Shortest undirected path between the first two anchors along plan edges. */
async function findPath(
  api: ContextGraphServerApi,
  tenantId: string,
  startId: string,
  goalId: string,
  plan: Plan
): Promise<TraversalResult> {
  const prev = new Map<string, { node: string; edgeId: string }>();
  const visited = new Set<string>([startId]);
  let frontier = [startId];

  for (let hop = 0; hop < 8 && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const node of frontier) {
      const [outRows, inRows] = await Promise.all([
        api.listEdges({
          tenantId,
          fromEntityId: node,
          type: plan.edgeType ?? undefined,
        }),
        api.listEdges({
          tenantId,
          toEntityId: node,
          type: plan.edgeType ?? undefined,
        }),
      ]);
      const neighbors = [
        ...outRows.map((e) => ({ other: e.object_id, edgeId: e.id })),
        ...inRows.map((e) => ({ other: e.subject_id, edgeId: e.id })),
      ];
      for (const { other, edgeId } of neighbors) {
        if (visited.has(other)) {
          continue;
        }
        visited.add(other);
        prev.set(other, { node, edgeId });
        if (other === goalId) {
          // Reconstruct path.
          const nodeIds: string[] = [goalId];
          const edgeIds: string[] = [];
          let cur = goalId;
          while (cur !== startId) {
            const p = prev.get(cur);
            if (!p) {
              break;
            }
            edgeIds.push(p.edgeId);
            nodeIds.push(p.node);
            cur = p.node;
          }
          return { edgeIds, foundIds: nodeIds, nodeIds };
        }
        next.push(other);
      }
    }
    frontier = next;
  }
  return { edgeIds: [], foundIds: [], nodeIds: [startId, goalId] };
}

interface RankResult {
  edgeIds: string[];
  nodeIds: string[];
  ranked: { count: number; name: string }[];
}

/** Rank entities by how many edges of a type point to (in) or from (out) them. */
async function rankByDegree(
  api: ContextGraphServerApi,
  tenantId: string,
  plan: Plan,
  entities: EntityRow[]
): Promise<RankResult> {
  const edges = await api.listEdges({
    tenantId,
    type: plan.edgeType ?? undefined,
  });
  // direction "out" counts out-degree (group by subject); otherwise in-degree (object).
  const byObject = plan.direction !== "out";
  const ownerKey = byObject ? "object_id" : "subject_id";
  const otherKey = byObject ? "subject_id" : "object_id";

  const counts = new Map<string, number>();
  const membersByOwner = new Map<string, { edgeId: string; other: string }[]>();
  for (const e of edges) {
    const owner = e[ownerKey];
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
    const list = membersByOwner.get(owner) ?? [];
    list.push({ edgeId: e.id, other: e[otherKey] });
    membersByOwner.set(owner, list);
  }

  const typeById = new Map(entities.map((e) => [e.id, e.type]));
  const nameById = new Map(
    entities.map((e) => [e.id, e.name ?? e.id.slice(0, 8)])
  );

  let entries = [...counts.entries()];
  if (plan.entityType) {
    entries = entries.filter(([id]) => typeById.get(id) === plan.entityType);
  }
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, plan.limit);

  const ranked = top.map(([id, count]) => ({
    count,
    name: nameById.get(id) ?? id.slice(0, 8),
  }));

  // Highlight the ranked leaders plus the winner's connected cluster.
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  for (const [id] of top) {
    nodeIds.add(id);
  }
  if (top.length > 0) {
    for (const m of membersByOwner.get(top[0][0]) ?? []) {
      edgeIds.add(m.edgeId);
      nodeIds.add(m.other);
    }
  }

  return { edgeIds: [...edgeIds], nodeIds: [...nodeIds], ranked };
}

async function phraseRanked(input: {
  edgeDisplay: string | null;
  question: string;
  ranked: { count: number; name: string }[];
}): Promise<string> {
  const { edgeDisplay, question, ranked } = input;
  const prompt = [
    "Answer the user's ranking question about an organisation graph using ONLY the data provided. Reply in the same language as the question, in 1-2 concise sentences. Lead with the top result and its count, then optionally mention the next few.",
    "",
    `Question: ${JSON.stringify(question)}`,
    `Relationship counted: ${edgeDisplay ? JSON.stringify(edgeDisplay) : "connections"}`,
    `Ranking (name → count), highest first: ${JSON.stringify(ranked)}`,
    "",
    "If the ranking is empty, say no data was found. Do not invent names or numbers.",
  ].join("\n");

  const result = await generateText({
    model: resolveChatModelId({ purpose: "chat" }),
    prompt,
    telemetry: { isEnabled: true },
  });
  return result.text.trim();
}

async function phraseAnswer(input: {
  anchorNames: string[];
  edgeDisplay: string | null;
  foundNames: string[];
  question: string;
}): Promise<string> {
  const { anchorNames, edgeDisplay, foundNames, question } = input;
  const prompt = [
    "Answer the user's question about an organisation graph using ONLY the data provided. Do not invent names. Reply in the same language as the question, in 1-2 concise sentences.",
    "",
    `Question: ${JSON.stringify(question)}`,
    `Anchor(s): ${JSON.stringify(anchorNames)}`,
    `Relationship: ${edgeDisplay ? JSON.stringify(edgeDisplay) : "any connection"}`,
    `Matching entities (${foundNames.length}): ${JSON.stringify(foundNames.slice(0, 60))}`,
    "",
    "If the list is empty, say that no matching entries were found. If there are many, summarise the count and list a few.",
  ].join("\n");

  const result = await generateText({
    model: resolveChatModelId({ purpose: "chat" }),
    prompt,
    telemetry: { isEnabled: true },
  });
  return result.text.trim();
}

export async function runNlQuery(input: {
  api: ContextGraphServerApi;
  question: string;
  tenantId: string;
}): Promise<AskResponse> {
  const { api, question, tenantId } = input;

  const snapshot = api.getOntology();
  const entityTypes = Object.values(snapshot.entityTypes).map((t) => ({
    id: t.id,
    displayName: t.displayName,
  }));
  const edgeTypes = Object.values(snapshot.edgeTypes).map((t) => ({
    id: t.id,
    displayName: t.displayName,
    subjectTypes: t.subjectTypes,
    objectTypes: t.objectTypes,
  }));

  const plan = await planQuery(question, { entityTypes, edgeTypes });

  const edgeDisplay = plan.edgeType
    ? (edgeTypes.find((e) => e.id === plan.edgeType)?.displayName ??
      plan.edgeType)
    : null;

  const emptyInterpretation = {
    anchors: plan.anchors.map((a) => a.name),
    depth: plan.depth,
    direction: plan.direction,
    edgeType: plan.edgeType ?? null,
    mode: plan.mode,
  };

  // Ranking/aggregation: no anchor, count edges across the whole graph.
  if (plan.understood && plan.mode === "rank" && plan.edgeType) {
    const allEntities = await api.listEntities({ tenantId });
    const { edgeIds, nodeIds, ranked } = await rankByDegree(
      api,
      tenantId,
      plan,
      allEntities
    );
    const answer = await phraseRanked({ edgeDisplay, question, ranked });
    return { answer, edgeIds, nodeIds, interpretation: emptyInterpretation };
  }

  if (!plan.understood || plan.anchors.length === 0) {
    return {
      answer:
        'I couldn\'t map that to a question about this graph. Try naming a person or relationship, e.g. "who reports to Gruber", or ask "who has the most direct reports".',
      edgeIds: [],
      nodeIds: [],
      interpretation: emptyInterpretation,
    };
  }

  // Resolve anchor names against stored entities (filtered by type when known).
  const entities = await api.listEntities({ tenantId });
  const resolved = plan.anchors
    .map((a) => resolveAnchor(entities, a.name, a.type))
    .filter((e): e is EntityRow => e !== null);

  if (resolved.length === 0) {
    return {
      answer: `I couldn't find ${plan.anchors.map((a) => `"${a.name}"`).join(" or ")} in the graph.`,
      edgeIds: [],
      nodeIds: [],
      interpretation: emptyInterpretation,
    };
  }

  const nameById = new Map(
    entities.map((e) => [e.id, e.name ?? e.id.slice(0, 8)])
  );

  let result: TraversalResult;
  if (plan.mode === "path" && resolved.length >= 2) {
    result = await findPath(
      api,
      tenantId,
      resolved[0].id,
      resolved[1].id,
      plan
    );
  } else {
    result = await traverse(
      api,
      tenantId,
      resolved.map((e) => e.id),
      plan
    );
  }

  const anchorIdSet = new Set(resolved.map((e) => e.id));
  const foundNames = result.foundIds
    .filter((id) => !anchorIdSet.has(id))
    .map((id) => nameById.get(id) ?? id.slice(0, 8));

  const answer = await phraseAnswer({
    anchorNames: resolved.map((e) => e.name ?? e.id.slice(0, 8)),
    edgeDisplay,
    foundNames,
    question,
  });

  return {
    answer,
    edgeIds: result.edgeIds,
    nodeIds: result.nodeIds,
    interpretation: emptyInterpretation,
  };
}
