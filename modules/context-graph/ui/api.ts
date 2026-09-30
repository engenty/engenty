import { requestApiJson } from "@engenty/api-client";

export interface ExternalRef {
  entity: string;
  id: string;
  module: string;
}

export interface EntityRow {
  attributes: Record<string, unknown>;
  created_at: string;
  external_ref: ExternalRef | null;
  id: string;
  name: string | null;
  tenant_id: string;
  type: string;
  updated_at: string;
}

export interface EdgeRow {
  attributes: Record<string, unknown>;
  created_at: string;
  id: string;
  object_id: string;
  subject_id: string;
  tenant_id: string;
  type: string;
  updated_at: string;
}

export interface OntologyEntityType {
  displayName: string;
  id: string;
  moduleId: string;
}

export interface OntologyEdgeType {
  displayName: string;
  id: string;
  moduleId: string;
  objectTypes: string[];
  subjectTypes: string[];
}

export interface OntologyResponse {
  edgeTypes: OntologyEdgeType[];
  entityTypes: OntologyEntityType[];
}

const BASE = "/api/context-graph";

export async function getOntology(
  signal?: AbortSignal
): Promise<OntologyResponse> {
  return requestApiJson(`${BASE}/ontology`, { signal });
}

export async function getEntities(
  params: { type?: string } = {},
  signal?: AbortSignal
): Promise<EntityRow[]> {
  const qs = params.type ? `?type=${encodeURIComponent(params.type)}` : "";
  return requestApiJson<{ items: EntityRow[] }>(`${BASE}/entities${qs}`, {
    signal,
  }).then((r) => r.items);
}

export async function getEntityDetail(
  id: string,
  signal?: AbortSignal
): Promise<{
  connectedNames: Record<string, string | null>;
  entity: EntityRow;
  incoming: EdgeRow[];
  outgoing: EdgeRow[];
}> {
  return requestApiJson(`${BASE}/entities/${id}`, { signal });
}

export async function getEdges(signal?: AbortSignal): Promise<EdgeRow[]> {
  return requestApiJson<{ items: EdgeRow[] }>(`${BASE}/edges`, { signal }).then(
    (r) => r.items
  );
}

export interface AskResult {
  answer: string;
  edgeIds: string[];
  interpretation: {
    anchors: string[];
    depth: number;
    direction: string;
    edgeType: string | null;
    mode: string;
  };
  nodeIds: string[];
}

export async function askGraph(
  question: string,
  signal?: AbortSignal
): Promise<AskResult> {
  return requestApiJson(`${BASE}/ask`, {
    method: "POST",
    body: { question },
    signal,
  });
}

export async function createEntity(input: {
  type: string;
  name?: string | null;
  attributes?: Record<string, unknown>;
  externalRef?: ExternalRef;
}): Promise<EntityRow> {
  return requestApiJson(`${BASE}/entities`, { method: "POST", body: input });
}

export async function updateEntity(
  id: string,
  input: { name?: string | null; attributes?: Record<string, unknown> }
): Promise<EntityRow> {
  return requestApiJson(`${BASE}/entities/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteEntity(id: string): Promise<void> {
  await requestApiJson(`${BASE}/entities/${id}`, { method: "DELETE" });
}

export async function createEdge(input: {
  type: string;
  subjectId: string;
  objectId: string;
  attributes?: Record<string, unknown>;
}): Promise<EdgeRow> {
  return requestApiJson(`${BASE}/edges`, { method: "POST", body: input });
}

export async function deleteEdge(id: string): Promise<void> {
  await requestApiJson(`${BASE}/edges/${id}`, { method: "DELETE" });
}

export interface ContextGraphSourceMeta {
  description: string | null;
  displayName: string;
  entityTypeIds: string[];
  id: string;
}

export interface ContextGraphSourceStatus {
  inGraph: number;
  inSource: number;
}

export interface ContextGraphSyncResult {
  edges: number;
  entities: number;
}

export async function getSources(
  signal?: AbortSignal
): Promise<ContextGraphSourceMeta[]> {
  return requestApiJson<{ sources: ContextGraphSourceMeta[] }>(
    `${BASE}/sources`,
    { signal }
  ).then((r) => r.sources);
}

export async function getSourceStatus(
  sourceId: string,
  signal?: AbortSignal
): Promise<ContextGraphSourceStatus> {
  return requestApiJson(
    `${BASE}/sources/${encodeURIComponent(sourceId)}/status`,
    {
      signal,
    }
  );
}

export async function syncSource(
  sourceId: string
): Promise<ContextGraphSyncResult> {
  return requestApiJson(
    `${BASE}/sources/${encodeURIComponent(sourceId)}/sync`,
    {
      method: "POST",
    }
  );
}
