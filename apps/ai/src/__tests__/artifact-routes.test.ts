import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { registerArtifactRoutes } from "../api/artifact-routes.js";
import type { AiScopeResolver } from "../api/http.js";
import { createStaticAiScopeResolver } from "../api/http.js";
import {
  type ArtifactRow,
  type ArtifactStore,
  ArtifactVersionConflictError,
  type ArtifactVersionRow,
  assertArtifactParentAllowed,
} from "../dal/artifacts/index.js";

const tenantA = "00000000-0000-4000-8000-00000000000a";
const tenantB = "00000000-0000-4000-8000-00000000000b";
const userId = "00000000-0000-4000-8000-000000000002";

/**
 * In-memory fake store keyed by tenant. Just enough behavior for route
 * outcomes: version conflict, scope promotion, tenant isolation.
 */
function makeFakeStore(): ArtifactStore {
  let seq = 0;
  const artifacts = new Map<string, ArtifactRow>();
  const versions: ArtifactVersionRow[] = [];
  const now = "2026-07-13T00:00:00.000Z";

  const scoped = (tenantId: string, id: string) => {
    const row = artifacts.get(id);
    return row && row.tenant_id === tenantId ? row : null;
  };

  return {
    async create(input) {
      seq += 1;
      const artifact: ArtifactRow = {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
        tenant_id: input.tenantId,
        type: input.type,
        title: input.title,
        scope_type: input.scopeType,
        scope_id: input.scopeId,
        thread_id: input.threadId ?? null,
        created_by_kind: input.createdByKind,
        created_by: input.createdBy ?? null,
        current_version: 1,
        parent_id: input.parentId ?? null,
        storage: "inline",
        storage_key: null,
        storage_connection_id: null,
        mime_type: null,
        size_bytes: null,
        status: "active",
        metadata: {},
        created_at: now,
        updated_at: now,
      };
      artifacts.set(artifact.id, artifact);
      const version: ArtifactVersionRow = {
        id: `version-${seq}-1`,
        artifact_id: artifact.id,
        tenant_id: input.tenantId,
        version: 1,
        content: input.content,
        storage_key: null,
        summary: null,
        created_by_kind: input.createdByKind,
        created_by: input.createdBy ?? null,
        created_at: now,
      };
      versions.push(version);
      return { artifact, version };
    },
    async get({ tenantId, artifactId, version }) {
      const artifact = scoped(tenantId, artifactId);
      if (!artifact) {
        return null;
      }
      const target = version ?? artifact.current_version;
      const found = versions.find(
        (v) => v.artifact_id === artifactId && v.version === target
      );
      return found ? { artifact, version: found } : null;
    },
    async listByScope({ tenantId, scopeType, scopeId }) {
      return [...artifacts.values()].filter(
        (a) =>
          a.tenant_id === tenantId &&
          a.scope_type === scopeType &&
          a.scope_id === scopeId &&
          a.status === "active"
      );
    },
    async listAllByTenant({ tenantId, includeArchived }) {
      return [...artifacts.values()].filter(
        (a) =>
          a.tenant_id === tenantId && (includeArchived || a.status === "active")
      );
    },
    async listByScopes({ tenantId, scopes }) {
      const seen = new Set<string>();
      const out: ArtifactRow[] = [];
      for (const scope of scopes) {
        for (const a of artifacts.values()) {
          if (
            a.tenant_id === tenantId &&
            a.scope_type === scope.scopeType &&
            a.scope_id === scope.scopeId &&
            a.status === "active" &&
            !seen.has(a.id)
          ) {
            seen.add(a.id);
            out.push(a);
          }
        }
      }
      return out;
    },
    async addVersion(input) {
      const artifact = scoped(input.tenantId, input.artifactId);
      if (!artifact) {
        throw new Error("not found");
      }
      if (artifact.current_version !== input.expectedVersion) {
        throw new ArtifactVersionConflictError(artifact.current_version);
      }
      const nextVersion = input.expectedVersion + 1;
      const version: ArtifactVersionRow = {
        id: `version-${artifact.id}-${nextVersion}`,
        artifact_id: artifact.id,
        tenant_id: input.tenantId,
        version: nextVersion,
        content: input.content,
        storage_key: null,
        summary: input.summary ?? null,
        created_by_kind: input.createdByKind,
        created_by: input.createdBy ?? null,
        created_at: now,
      };
      versions.push(version);
      artifact.current_version = nextVersion;
      if (input.title) {
        artifact.title = input.title;
      }
      return { artifact, version };
    },
    async updateScope({ tenantId, artifactId, scopeType, scopeId }) {
      const artifact = scoped(tenantId, artifactId);
      if (!artifact) {
        return null;
      }
      artifact.scope_type = scopeType;
      artifact.scope_id = scopeId;
      return artifact;
    },
    async setStatus({ tenantId, artifactId, status }) {
      const artifact = scoped(tenantId, artifactId);
      if (!artifact) {
        return null;
      }
      artifact.status = status;
      return artifact;
    },
    async listVersions({ tenantId, artifactId }) {
      const artifact = scoped(tenantId, artifactId);
      if (!artifact) {
        return null;
      }
      return versions
        .filter((v) => v.artifact_id === artifactId && v.tenant_id === tenantId)
        .map((v) => ({
          created_at: v.created_at,
          created_by: v.created_by,
          created_by_kind: v.created_by_kind,
          summary: v.summary,
          version: v.version,
        }))
        .sort((a, b) => b.version - a.version);
    },
    async updateParent({ tenantId, artifactId, parentId }) {
      const artifact = scoped(tenantId, artifactId);
      if (!artifact) {
        return null;
      }
      const parent = parentId ? scoped(tenantId, parentId) : null;
      assertArtifactParentAllowed({
        artifact,
        parent,
        parentId,
        parentOf: (id) => scoped(tenantId, id)?.parent_id ?? null,
      });
      artifact.parent_id = parentId;
      return artifact;
    },
    // Not exercised by any route test here. Throwing rather than returning a
    // plausible null keeps an accidental dependency loud instead of silent.
    mergeMetadata() {
      throw new Error("mergeMetadata is not part of these route tests");
    },
    getStorageBinding() {
      throw new Error("getStorageBinding is not part of these route tests");
    },
    setStorageBinding() {
      throw new Error("setStorageBinding is not part of these route tests");
    },
  };
}

function makeHarness(opts?: { scopeResolver?: AiScopeResolver }) {
  const app = new Hono();
  const artifactStore = makeFakeStore();
  registerArtifactRoutes(app as never, {
    artifactStore,
    scopeResolver:
      opts?.scopeResolver ??
      createStaticAiScopeResolver({ tenantId: tenantA, userId } as never),
  });
  return { app, artifactStore };
}

async function createArtifact(app: Hono, threadId: string, title = "Doc") {
  const res = await app.request("/ai/artifacts", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer t" },
    body: JSON.stringify({
      type: "markdown",
      title,
      scope_id: threadId,
      content: "# Hello",
    }),
  });
  return res;
}

describe("artifact routes", () => {
  it("creates then reads back version 1 with content", async () => {
    const { app } = makeHarness();
    const created = await createArtifact(app, "thread-1");
    expect(created.status).toBe(201);
    const { artifact } = (await created.json()) as { artifact: { id: string } };

    const got = await app.request(`/ai/artifacts/${artifact.id}`, {
      headers: { authorization: "Bearer t" },
    });
    expect(got.status).toBe(200);
    const body = (await got.json()) as {
      version: { version: number; content: string };
    };
    expect(body.version.version).toBe(1);
    expect(body.version.content).toBe("# Hello");
  });

  it("rejects a stale version with 409 and leaves the version unchanged", async () => {
    const { app } = makeHarness();
    const { artifact } = (await (
      await createArtifact(app, "thread-1")
    ).json()) as {
      artifact: { id: string };
    };

    const conflict = await app.request(
      `/ai/artifacts/${artifact.id}/versions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer t",
        },
        body: JSON.stringify({ content: "# Changed", expected_version: 99 }),
      }
    );
    expect(conflict.status).toBe(409);

    const got = await app.request(`/ai/artifacts/${artifact.id}`, {
      headers: { authorization: "Bearer t" },
    });
    const body = (await got.json()) as { version: { version: number } };
    expect(body.version.version).toBe(1);
  });

  it("promotes an artifact to a project scope: it appears there and leaves the thread", async () => {
    const { app } = makeHarness();
    const { artifact } = (await (
      await createArtifact(app, "thread-1")
    ).json()) as {
      artifact: { id: string };
    };

    const stored = await app.request(`/ai/artifacts/${artifact.id}/store`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer t",
      },
      body: JSON.stringify({ scope_type: "project", scope_id: "project-9" }),
    });
    expect(stored.status).toBe(200);

    const inProject = await app.request(
      "/ai/artifacts?scope_type=project&scope_id=project-9",
      { headers: { authorization: "Bearer t" } }
    );
    const projList = (await inProject.json()) as { artifacts: unknown[] };
    expect(projList.artifacts).toHaveLength(1);

    const inThread = await app.request(
      "/ai/artifacts?scope_type=thread&scope_id=thread-1",
      { headers: { authorization: "Bearer t" } }
    );
    const threadList = (await inThread.json()) as { artifacts: unknown[] };
    expect(threadList.artifacts).toHaveLength(0);
  });

  it("returns 401 when the scope cannot be resolved", async () => {
    const rejecting: AiScopeResolver = async () => ({
      ok: false,
      error: "unauthorized",
      status: 401,
    });
    const { app } = makeHarness({ scopeResolver: rejecting });
    const res = await app.request(
      "/ai/artifacts?scope_type=thread&scope_id=thread-1",
      { headers: {} }
    );
    expect(res.status).toBe(401);
  });

  it("does not leak another tenant's artifact", async () => {
    // Tenant A creates; a tenant-B-scoped app cannot read it.
    const { app, artifactStore } = makeHarness();
    const { artifact } = (await (
      await createArtifact(app, "thread-1")
    ).json()) as {
      artifact: { id: string };
    };

    const appB = new Hono();
    registerArtifactRoutes(appB as never, {
      artifactStore, // same store, different tenant scope
      scopeResolver: createStaticAiScopeResolver({
        tenantId: tenantB,
        userId,
      } as never),
    });
    const res = await appB.request(`/ai/artifacts/${artifact.id}`, {
      headers: { authorization: "Bearer t" },
    });
    expect(res.status).toBe(404);
  });

  it("refuses to move a page under a folder in another Space", async () => {
    const { app } = makeHarness();
    const post = (body: Record<string, unknown>) =>
      app.request("/ai/artifacts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer t",
        },
        body: JSON.stringify({ content: "", scope_type: "space", ...body }),
      });
    const folder = (await (
      await post({
        scope_id: "019fe8ec-0000-4000-8000-00000000000a",
        title: "Notes",
        type: "folder",
      })
    ).json()) as { artifact: { id: string } };
    const page = (await (
      await post({
        scope_id: "019fe8ec-0000-4000-8000-00000000000b",
        title: "Page",
        type: "markdown",
      })
    ).json()) as { artifact: { id: string } };

    const moved = await app.request(`/ai/artifacts/${page.artifact.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer t",
      },
      body: JSON.stringify({ parent_id: folder.artifact.id }),
    });

    expect(moved.status).toBe(400);
  });
});
