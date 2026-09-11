import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppBuildEnvelope } from "../app-build-schema.js";

// Mirrors the `Invoker` type in app-build-steps.ts: the operation invoker
// returns `unknown` and each step casts to the shape it needs, so the mock
// must be free to resolve any envelope rather than the first one written.
const invoke = vi.fn<(op: string, input?: Record<string, unknown>) => unknown>(
  () => ({ ok: true })
);
const artifactCreate = vi.fn<
  (input: { content: string; type: string }) => {
    artifact: { id: string };
    version: { version: number };
  }
>(() => ({
  artifact: { id: "artifact-1" },
  version: { version: 1 },
}));

/**
 * Mastra widens a step's `execute` return to `InnerOutput | <declared>` for its
 * internal bail path. Every step here declares `Promise<AppBuildEnvelope>` and
 * none of them bail, so narrow once at the seam instead of at each assertion.
 */
async function runStep(
  step: { execute: (params: never) => Promise<unknown> },
  inputData: Record<string, unknown>
): Promise<AppBuildEnvelope> {
  return (await step.execute({ inputData } as never)) as AppBuildEnvelope;
}

vi.mock("../../sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invoke,
}));
vi.mock("../task-job-scope.js", () => ({
  resolveTaskJobServiceScope: async () => ({
    tenantId: "22222222-2222-4222-8222-222222222222",
    accessToken: "service-jwt",
  }),
}));
vi.mock("../../../dal/artifacts/artifact-store.js", () => ({
  createArtifactStoreFromEnv: () => ({ create: artifactCreate }),
}));

import {
  ensureAppStep,
  proposeStep,
  publishArtifactStep,
  writeFilesStep,
} from "../app-build-steps.js";

const TENANT = "22222222-2222-4222-8222-222222222222";
const APP_ID = "11111111-1111-4111-8111-111111111111";

const input = {
  agent_type_key: "engenty.app-coder",
  files: { "index.html": "<h1>hi</h1>" },
  manifest: { entry: { frontend: "index.html" }, name: "Todo" },
  name: "Todo",
  tenant_id: TENANT,
  thread_id: "thread-1",
};

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({ ok: true });
  artifactCreate.mockClear();
});

describe("ensureAppStep", () => {
  it("reuses an existing app with the same slug instead of minting a sibling", async () => {
    // The chat E2E's defining failure: three duplicate apps. This is the fix.
    invoke.mockImplementation(async (op: string) =>
      op === "app_list"
        ? { apps: [{ id: APP_ID, slug: "todo" }] }
        : { ok: true }
    );

    const envelope = await runStep(ensureAppStep, input);

    expect(envelope.app_id).toBe(APP_ID);
    expect(invoke).not.toHaveBeenCalledWith("app_create", expect.anything());
  });

  it("creates the app with agent attribution when the slug is new", async () => {
    invoke.mockImplementation(async (op: string) =>
      op === "app_list" ? { apps: [] } : { id: APP_ID }
    );

    const envelope = await runStep(ensureAppStep, input);

    expect(envelope.app_id).toBe(APP_ID);
    expect(envelope.slug).toBe("todo");
    expect(invoke).toHaveBeenCalledWith(
      "app_create",
      expect.objectContaining({
        created_by_agent_type_key: "engenty.app-coder",
        slug: "todo",
      })
    );
  });

  it("derives a valid slug from an unruly name", async () => {
    invoke.mockImplementation(async (op: string) =>
      op === "app_list" ? { apps: [] } : { id: APP_ID }
    );

    const envelope = await runStep(ensureAppStep, {
      ...input,
      name: "Über-Spesen (2026)!",
    });

    expect(envelope.slug).toMatch(/^[a-z0-9][a-z0-9-]{1,62}$/);
  });
});

describe("writeFilesStep", () => {
  it("commits files and manifest into the App's repository", async () => {
    const envelope = await runStep(writeFilesStep, {
      ...input,
      app_id: APP_ID,
      slug: "todo",
      status: "created",
    });

    expect(invoke).toHaveBeenCalledWith("app_file_write", {
      app_id: APP_ID,
      files: input.files,
      manifest: input.manifest,
      message: "app_build",
    });
    expect(envelope.status).toBe("written");
  });
});

describe("proposeStep", () => {
  const written = {
    ...input,
    app_id: APP_ID,
    slug: "todo",
    status: "written" as const,
  };

  it("records version and release on a green build", async () => {
    invoke.mockResolvedValue({ release: "rel-abc", version: 3 });

    const envelope = await runStep(proposeStep, written);

    expect(envelope.status).toBe("built");
    expect(envelope.version).toBe(3);
    expect(envelope.release).toBe("rel-abc");
  });

  it("captures the failed version's build_log instead of throwing", async () => {
    invoke.mockImplementation(async (op: string) => {
      if (op === "app_release_propose") {
        throw new Error("app_build_failed");
      }
      return {
        versions: [
          { build_log: "src/App.tsx:3:1: ERROR: boom", status: "failed" },
          { build_log: null, status: "active" },
        ],
      };
    });

    const envelope = await runStep(proposeStep, written);

    expect(envelope.status).toBe("build_failed");
    expect(envelope.build_log).toContain("src/App.tsx:3:1");
  });

  it("rethrows anything that is not a build failure", async () => {
    invoke.mockRejectedValue(new Error("app_host_unavailable"));

    await expect(runStep(proposeStep, written)).rejects.toThrow(
      "app_host_unavailable"
    );
  });
});

describe("publishArtifactStep", () => {
  const built = {
    ...input,
    app_id: APP_ID,
    release: "rel-abc",
    slug: "todo",
    status: "built" as const,
    version: 3,
  };

  it("publishes the app HANDLE pinned to the built version — never a source copy", async () => {
    const envelope = await runStep(publishArtifactStep, built);

    expect(envelope.status).toBe("published");
    expect(envelope.artifact_id).toBe("artifact-1");
    const created = artifactCreate.mock.calls[0][0];
    expect(created.type).toBe("app");
    expect(JSON.parse(created.content)).toEqual({
      app_id: APP_ID,
      app_version: 3,
      session_id: "chat-thread-1",
    });
  });

  it("passes a failed build through untouched", async () => {
    const envelope = await runStep(publishArtifactStep, {
      ...built,
      build_log: "boom",
      status: "build_failed",
    });

    expect(envelope.status).toBe("build_failed");
    expect(artifactCreate).not.toHaveBeenCalled();
  });

  it("skips publishing outside a chat thread", async () => {
    const { thread_id: _dropped, ...headless } = built;

    const envelope = await runStep(publishArtifactStep, headless);

    expect(envelope.status).toBe("built");
    expect(artifactCreate).not.toHaveBeenCalled();
  });
});
