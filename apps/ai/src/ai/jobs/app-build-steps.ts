// Steps for the App Build workflow. The build SEQUENCE lives here as code —
// ensure the app exists, write the draft, propose (which compiles), publish
// the artifact handle — because the chat E2E proved a model cannot carry that
// sequence across interruptions: it lost its own app_id and created three
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
import { resolveTaskJobServiceScope } from "./task-job-scope.js";

type Invoker = (
  operationId: string,
  input: Record<string, unknown>
) => Promise<unknown>;

async function invokerFor(tenantId: string): Promise<Invoker> {
  const als = getEngentyToolsRunContext();
  if (als.userAccessToken && als.tenantId === tenantId) {
    const scope = {
      tenantId,
      userAccessToken: als.userAccessToken,
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

// 2) Merge the authored files + manifest into the draft version.
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
    });
    return { ...inputData, status: "written" };
  },
});

// 3) Build. A failed build is a NORMAL outcome of this workflow, not an
// error: the envelope carries the verbatim build_log for the agent's fix
// loop, and the version number has not advanced.
export const proposeStep = createStep({
  id: "propose",
  inputSchema: appBuildEnvelopeSchema,
  outputSchema: appBuildEnvelopeSchema,
  execute: async ({ inputData }): Promise<AppBuildEnvelope> => {
    const invoke = await invokerFor(inputData.tenant_id);
    try {
      const version = (await invoke("app_release_propose", {
        app_id: inputData.app_id,
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
      // The op's error payload doesn't carry the log; the draft row does.
      const versions = (await invoke("app_versions_list", {
        id: inputData.app_id,
      }).catch(() => null)) as {
        versions?: Array<{ build_log?: string | null; status?: string }>;
      } | null;
      const draft = (versions?.versions ?? []).find(
        (candidate) => candidate.status === "proposed"
      );
      return {
        ...inputData,
        build_log:
          draft?.build_log ?? "build failed, and no build log was recorded",
        status: "build_failed",
      };
    }
  },
});

// 4) Publish the artifact HANDLE — never a copy of the source. Pinned to the
// version just built, so the user previews exactly what they then approve
// (and the pin stays correct after approval: it is the same version number).
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
      scopeId: inputData.thread_id,
      scopeType: "thread",
      tenantId: inputData.tenant_id,
      threadId: inputData.thread_id,
      title: inputData.name,
      type: "app",
    });
    return { ...inputData, artifact_id: artifact.id, status: "published" };
  },
});
