import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (_op: string, _input: Record<string, unknown>) => ({
  ok: true,
}));
const artifactCreate = vi.fn(async () => ({
  artifact: { id: "artifact-1" },
  version: { version: 1 },
}));

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

    const envelope = await ensureAppStep.execute({ inputData: input } as never);

    expect(envelope.app_id).toBe(APP_ID);
    expect(invoke).not.toHaveBeenCalledWith("app_create", expect.anything());
  });

  it("creates the app with agent attribution when the slug is new", async () => {
    invoke.mockImplementation(async (op: string) =>
      op === "app_list" ? { apps: [] } : { id: APP_ID }
    );

    const envelope = await ensureAppStep.execute({ inputData: input } as never);

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

    const envelope = await ensureAppStep.execute({
      inputData: { ...input, name: "Über-Spesen (2026)!" },
    } as never);

    expect(envelope.slug).toMatch(/^[a-z0-9][a-z0-9-]{1,62}$/);
  });
});

describe("writeFilesStep", () => {
  it("merges files and manifest into the draft", async () => {
    const envelope = await writeFilesStep.execute({
      inputData: { ...input, app_id: APP_ID, slug: "todo", status: "created" },
    } as never);

    expect(invoke).toHaveBeenCalledWith("app_file_write", {
      app_id: APP_ID,
      files: input.files,
      manifest: input.manifest,
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

    const envelope = await proposeStep.execute({ inputData: written } as never);

    expect(envelope.status).toBe("built");
    expect(envelope.version).toBe(3);
    expect(envelope.release).toBe("rel-abc");
  });

  it("captures the draft's build_log on a failed build instead of throwing", async () => {
    invoke.mockImplementation(async (op: string) => {
      if (op === "app_release_propose") {
        throw new Error("app_build_failed");
      }
      return {
        versions: [
          { build_log: "src/App.tsx:3:1: ERROR: boom", status: "proposed" },
          { build_log: null, status: "active" },
        ],
      };
    });

    const envelope = await proposeStep.execute({ inputData: written } as never);

    expect(envelope.status).toBe("build_failed");
    expect(envelope.build_log).toContain("src/App.tsx:3:1");
  });

  it("rethrows anything that is not a build failure", async () => {
    invoke.mockRejectedValue(new Error("app_host_unavailable"));

    await expect(
      proposeStep.execute({ inputData: written } as never)
    ).rejects.toThrow("app_host_unavailable");
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
    const envelope = await publishArtifactStep.execute({
      inputData: built,
    } as never);

    expect(envelope.status).toBe("published");
    expect(envelope.artifact_id).toBe("artifact-1");
    const created = artifactCreate.mock.calls[0][0] as {
      content: string;
      type: string;
    };
    expect(created.type).toBe("app");
    expect(JSON.parse(created.content)).toEqual({
      app_id: APP_ID,
      app_version: 3,
      session_id: "chat-thread-1",
    });
  });

  it("passes a failed build through untouched", async () => {
    const envelope = await publishArtifactStep.execute({
      inputData: { ...built, build_log: "boom", status: "build_failed" },
    } as never);

    expect(envelope.status).toBe("build_failed");
    expect(artifactCreate).not.toHaveBeenCalled();
  });

  it("skips publishing outside a chat thread", async () => {
    const { thread_id: _dropped, ...headless } = built;

    const envelope = await publishArtifactStep.execute({
      inputData: headless,
    } as never);

    expect(envelope.status).toBe("built");
    expect(artifactCreate).not.toHaveBeenCalled();
  });
});
