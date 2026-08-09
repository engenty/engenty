import { describe, expect, it } from "vitest";
import { registerProjectsApi } from "./index.js";
import { makeMockApi, makeMockProjectRepo } from "./test-helpers.js";

function operationContext(auth: unknown) {
  return {
    auth,
    config: {},
    pluginConfig: {},
    resolvePath: (p: string) => p,
    logger: {
      debug: () => {},
      error: () => {},
      info: () => {},
      warn: () => {},
    },
  };
}

function setup() {
  const repo = makeMockProjectRepo();
  const { api, serverOperations, defaultAuth } = makeMockApi();
  registerProjectsApi(api, repo);
  const operation = serverOperations.find(
    (candidate) => candidate.operationId === "projects_create_tasks"
  );
  if (!operation) {
    throw new Error("projects_create_tasks not registered");
  }
  return { defaultAuth, operation, repo };
}

describe("projects_create_tasks", () => {
  it("creates a whole batch in one call", async () => {
    const { defaultAuth, operation } = setup();

    const result = (await operation.handler(
      {
        project_id: "project-1",
        tasks: [
          { title: "Requirements erheben" },
          { title: "Wireframes erstellen" },
          { title: "Technisches Konzept" },
        ],
      },
      operationContext(defaultAuth)
    )) as {
      created: { title: string }[];
      created_count: number;
      failed_count: number;
    };

    expect(result.created_count).toBe(3);
    expect(result.failed_count).toBe(0);
    expect(result.created.map((task) => task.title)).toEqual([
      "Requirements erheben",
      "Wireframes erstellen",
      "Technisches Konzept",
    ]);
  });

  it("reports a bad row instead of losing the rest of the batch", async () => {
    const { defaultAuth, operation } = setup();

    const result = (await operation.handler(
      {
        project_id: "project-1",
        tasks: [
          { title: "Good one" },
          { status: "not-a-real-status", title: "Bad status" },
          { title: "Another good one" },
        ],
      },
      operationContext(defaultAuth)
    )) as {
      created_count: number;
      failed: { error: string; index: number; title?: string }[];
      failed_count: number;
    };

    // The two valid rows are kept — a partial batch beats losing the work.
    expect(result.created_count).toBe(2);
    expect(result.failed_count).toBe(1);
    expect(result.failed[0]).toMatchObject({ index: 1, title: "Bad status" });
    expect(result.failed[0]?.error).toContain("Invalid task status");
  });

  it("is declared write-risk and approval-gated like the single create", async () => {
    const { operation } = setup();

    expect(operation.riskLevel).toBe("high");
    expect(operation.requiresApproval).toBe(true);
    expect(operation.requiredCapabilities).toContain("module.projects.write");
  });

  it("rejects a batch above the ceiling", () => {
    const { operation } = setup();
    const tasks = Array.from({ length: 101 }, (_, i) => ({ title: `T${i}` }));

    const parsed = operation.inputSchema?.safeParse({
      project_id: "project-1",
      tasks,
    });
    expect(parsed?.success).toBe(false);
  });

  it("reads project settings once for the whole batch", async () => {
    const { defaultAuth, operation, repo } = setup();
    let settingsReads = 0;
    const originalGetSettings = repo.getSettings.bind(repo);
    repo.getSettings = async () => {
      settingsReads += 1;
      return originalGetSettings();
    };

    await operation.handler(
      {
        project_id: "project-1",
        tasks: Array.from({ length: 5 }, (_, i) => ({ title: `Task ${i}` })),
      },
      operationContext(defaultAuth)
    );

    expect(settingsReads).toBe(1);
  });
});
