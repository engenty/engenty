// Steps for the App Build workflow. The build SEQUENCE lives here as code —
// ensure the app exists, commit the files, propose (which builds), publish
// the artifact handle — because a model cannot carry that sequence across
// interruptions: left to itself it lost its own app_id and created three
// duplicate apps. Each step is idempotent against its target, so re-running
// the workflow with fixed files is always safe.
//
// Auth: inside a chat the app_build tool runs under `engentyToolsRunAls`, and
// `run.start()` executes these steps in the same async context — so the
// caller's own bearer rides along without ever entering the workflow snapshot.
// Headless (or resumed-after-crash, where the ALS is gone) falls back to the
// AI service principal, tenant-checked, exactly like task-job steps.
import { createStep } from "@mastra/core/workflows";
import { getEngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import { createArtifactStoreFromEnv } from "../../dal/artifacts/artifact-store.js";
import { createScopeModuleOperationInvoker } from "../sessions/task-workspace-hook.js";
import type { AiSessionScope } from "../sessions/types.js";
import {
  type AppBuildEnvelope,
  appBuildEnvelopeSchema,
  appBuildInputSchema,
} from "./app-build-schema.js";
import { announceAppRelease } from "./app-release-announce.js";
import { resolveTaskJobServiceScope } from "./task-job-scope.js";

type Invoker = (
  operationId: string,
  input: Record<string, unknown>
) => Promise<unknown>;

async function invokerFor(tenantId: string): Promise<Invoker> {
  const als = getEngentyToolsRunContext();
  if (als.accessToken && als.tenantId === tenantId) {
    const scope = {
      tenantId,
      credential: { kind: "user", token: als.accessToken },
      // The space the chat runs in: `app_create` records it, and it decides
      // where the App's directory sits and which space computer sees it.
      spaceId: als.space?.spaceId ?? null,
      userId: als.userId ?? null,
    } as AiSessionScope;
    return createScopeModuleOperationInvoker(scope) as Invoker;
  }
  const scope = await resolveTaskJobServiceScope(tenantId);
  return createScopeModuleOperationInvoker(scope) as Invoker;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) ? slug : `app-${Date.now()}`;
}

function isBuildFailed(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("app_build_failed");
}

// 1) Find-or-create by slug. This is what makes a retry after a failed build
// land on the SAME app instead of minting a sibling.
export const ensureAppStep = createStep({
  id: "ensure-app",
  inputSchema: appBuildInputSchema,
  outputSchema: appBuildEnvelopeSchema,
  execute: async ({ inputData }): Promise<AppBuildEnvelope> => {
    const invoke = await invokerFor(inputData.tenant_id);
    const slug = inputData.slug ?? slugify(inputData.name);

    const listed = (await invoke("app_list", {})) as {
      apps?: Array<{ id?: string; slug?: string }>;
    } | null;
    const existing = (listed?.apps ?? []).find((app) => app.slug === slug);
    if (existing?.id) {
      return { ...inputData, app_id: existing.id, slug, status: "created" };
    }

    const created = (await invoke("app_create", {
      ...(inputData.agent_type_key
        ? { created_by_agent_type_key: inputData.agent_type_key }
        : {}),
      ...(inputData.description ? { description: inputData.description } : {}),
      name: inputData.name,
      slug,
    })) as { id?: string } | null;
    if (!created?.id) {
      throw new Error("app-build: app_create returned no app id");
    }
    return { ...inputData, app_id: created.id, slug, status: "created" };
  },
});

// 2) Commit the authored files + manifest into the App's repository.
export const writeFilesStep = createStep({
  id: "write-files",
  inputSchema: appBuildEnvelopeSchema,
  outputSchema: appBuildEnvelopeSchema,
  execute: async ({ inputData }): Promise<AppBuildEnvelope> => {
    const invoke = await invokerFor(inputData.tenant_id);
    await invoke("app_file_write", {
      app_id: inputData.app_id,
      files: inputData.files,
      manifest: inputData.manifest,
      message: inputData.message ?? "app_build",
    });
    return { ...inputData, status: "written" };
  },
});

// 3) Build. A failed build is a NORMAL outcome of this workflow, not an
// error: it is recorded as a failed version, and the envelope carries that
// version's verbatim build_log for the agent's fix loop.
export const proposeStep = createStep({
  id: "propose",
  inputSchema: appBuildEnvelopeSchema,
  outputSchema: appBuildEnvelopeSchema,
  execute: async ({ inputData }): Promise<AppBuildEnvelope> => {
    const invoke = await invokerFor(inputData.tenant_id);
    try {
      const version = (await invoke("app_release_propose", {
        app_id: inputData.app_id,
        ...(inputData.message ? { note: inputData.message } : {}),
      })) as { release?: string | null; version?: number } | null;
      return {
        ...inputData,
        release: version?.release ?? undefined,
        status: "built",
        version: version?.version,
      };
    } catch (error) {
      if (!isBuildFailed(error)) {
        throw error;
      }
      // The op's error payload doesn't carry the log; the failed version does.
      const versions = (await invoke("app_versions_list", {
        id: inputData.app_id,
      }).catch(() => null)) as {
        versions?: Array<{ build_log?: string | null; status?: string }>;
      } | null;
      const failed = (versions?.versions ?? []).find(
        (candidate) => candidate.status === "failed"
      );
      return {
        ...inputData,
        build_log:
          failed?.build_log ?? "build failed, and no build log was recorded",
        status: "build_failed",
      };
    }
  },
});

// 4) Publish the artifact HANDLE — never a copy of the source. Pinned to the
// version just built, so the user previews exactly what they then approve
// (and the pin stays correct after approval: it is the same version number).
//
// Scope: the SPACE when the run has one, the thread otherwise. A space chat's
// ALS carries the space already validated against the caller's access (Phase
// C3a), and an app built there belongs to the space — thread scope made every
// app invisible to the space's Data tree, reachable only by scrolling the chat
// that happened to build it. The chat still shows it either way: the row keeps
// `thread_id`, and the space pane merges the space scope into its tabs.
export const publishArtifactStep = createStep({
  id: "publish-artifact",
  inputSchema: appBuildEnvelopeSchema,
  outputSchema: appBuildEnvelopeSchema,
  execute: async ({ inputData }): Promise<AppBuildEnvelope> => {
    if (inputData.status !== "built" || !inputData.thread_id) {
      return inputData;
    }
    const store = createArtifactStoreFromEnv();
    if (!store) {
      return {
        ...inputData,
        note: "artifact store unavailable — app built, nothing published",
      };
    }
    const als = getEngentyToolsRunContext();
    const spaceId = als.space?.spaceId ?? null;
    const { artifact } = await store.create({
      content: JSON.stringify({
        app_id: inputData.app_id,
        ...(inputData.version === undefined
          ? {}
          : { app_version: inputData.version }),
        session_id: inputData.session_id ?? `chat-${inputData.thread_id}`,
      }),
      createdBy: als.userId ?? null,
      createdByKind: inputData.agent_type_key ? "agent" : "user",
      scopeId: spaceId ?? inputData.thread_id,
      scopeType: spaceId ? "space" : "thread",
      tenantId: inputData.tenant_id,
      threadId: inputData.thread_id,
      title: inputData.name,
      type: "app",
    });
    // The version is built and inert until a person activates it. Say so where
    // they are looking, and in the bell — the build alone is not the news.
    if (inputData.version !== undefined) {
      await announceAppRelease({
        appId: inputData.app_id,
        artifactId: artifact.id,
        builtByAgentId: als.agentId ?? null,
        name: inputData.name,
        tenantId: inputData.tenant_id,
        threadId: inputData.thread_id,
        userId: als.userId ?? null,
        version: inputData.version,
      });
    }
    return { ...inputData, artifact_id: artifact.id, status: "published" };
  },
});
