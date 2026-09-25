import { beforeEach, describe, expect, it, vi } from "vitest";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";

// The step resolves its store through this factory; capture create() inputs.
const storeCapture = vi.hoisted(() => ({
  created: [] as Record<string, unknown>[],
}));
vi.mock("../dal/artifacts/artifact-store.js", () => ({
  createArtifactStoreFromEnv: () => ({
    create: async (params: Record<string, unknown>) => {
      storeCapture.created.push(params);
      return { artifact: { id: "artifact-1" } };
    },
  }),
}));

import { publishArtifactStep } from "../ai/jobs/app-build-steps.js";

const BUILT = {
  agent_type_key: null,
  app_id: "00000000-0000-0000-0000-000000000001",
  name: "Test Weekly Planner",
  status: "built" as const,
  tenant_id: "00000000-0000-0000-0000-0000000000aa",
  thread_id: "thread-1",
  version: 3,
};

const SPACE = {
  allConnectorPrefixes: new Set<string>(),
  connectorPrefixes: new Set<string>(),
  moduleIds: new Set<string>(),
  readOnlyModuleIds: new Set<string>(),
  spaceId: "00000000-0000-0000-0000-0000000000ff",
};

async function runStep(inputData: typeof BUILT) {
  // The step only reads inputData off its Mastra context.
  return (await (
    publishArtifactStep as unknown as {
      execute: (ctx: { inputData: typeof BUILT }) => Promise<{
        artifact_id?: string;
        status: string;
      }>;
    }
  ).execute({ inputData })) as { artifact_id?: string; status: string };
}

describe("publishArtifactStep scope", () => {
  beforeEach(() => {
    storeCapture.created.length = 0;
  });

  it("publishes SPACE-scoped when the run's ALS carries a space", async () => {
    const result = await engentyToolsRunAls.run(
      { space: SPACE, tenantId: BUILT.tenant_id, userId: "user-1" },
      () => runStep(BUILT)
    );
    expect(result.status).toBe("published");
    expect(storeCapture.created).toHaveLength(1);
    expect(storeCapture.created[0]).toMatchObject({
      scopeId: SPACE.spaceId,
      scopeType: "space",
      // The chat that built the app must still find it.
      threadId: BUILT.thread_id,
    });
  });

  it("falls back to THREAD scope outside a space", async () => {
    const result = await engentyToolsRunAls.run(
      { tenantId: BUILT.tenant_id, userId: "user-1" },
      () => runStep(BUILT)
    );
    expect(result.status).toBe("published");
    expect(storeCapture.created[0]).toMatchObject({
      scopeId: BUILT.thread_id,
      scopeType: "thread",
    });
  });
});
