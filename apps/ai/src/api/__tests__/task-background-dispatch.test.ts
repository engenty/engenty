// Tier-1 HITL (Phase 8 P8-3): a dispatch prefers RESUMING the run that stopped
// to ask over starting a second one — and every failure mode falls back to the
// park path, which is the one that always worked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const runTaskJobPipeline = vi.fn(
  async (..._args: unknown[]): Promise<unknown> => ({
    envelope: { status: "released" },
    waitedOnAPerson: false,
  })
);

vi.mock("../../ai/jobs/task-job-pipeline.js", () => ({
  runTaskJobPipeline: (...args: unknown[]) => runTaskJobPipeline(...args),
}));

import {
  registerTaskJobExecutor,
  startTaskJob,
  TASK_JOB_MAX_ATTEMPTS,
  TASK_JOB_TOOL_NAME,
  taskJobRecoveryTool,
} from "../task-background-dispatch.js";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";

function managerStub(overrides: Record<string, unknown> = {}) {
  return {
    enqueue: vi.fn(async () => ({ task: { id: "bg-1" } })),
    listTasks: vi.fn(async () => ({ tasks: [], total: 0 })),
    registerStaticExecutor: vi.fn(),
    resume: vi.fn(async () => ({ id: "bg-0" })),
    waitForNextTask: vi.fn(async () => ({ status: "completed" })),
    ...overrides,
  };
}

function mastraWith(manager: unknown) {
  return { backgroundTaskManager: manager } as never;
}

const INPUT = {
  agent_type_key: "engenty.coordinator",
  task_id: TASK_ID,
  tenant_id: TENANT_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
  runTaskJobPipeline.mockResolvedValue({
    envelope: { status: "released" },
    waitedOnAPerson: false,
  });
});

describe("dispatching a task job", () => {
  it("enqueues a fresh run with a retry budget — recovery needs one", async () => {
    const manager = managerStub();
    await startTaskJob(mastraWith(manager), INPUT);

    const payload = manager.enqueue.mock.calls
      .at(0)
      ?.at(0) as unknown as Record<string, unknown>;
    expect(payload.toolName).toBe("engenty.task-job");
    expect(payload.maxRetries).toBe(TASK_JOB_MAX_ATTEMPTS);
    // The run id travels in the args: a restart must re-enter on the same one
    // or it collides with the checkout its own previous attempt took.
    expect((payload.args as { __run_id?: string }).__run_id).toBe(
      payload.runId
    );
  });

  it("resumes the run that was waiting on a person instead of starting a second", async () => {
    const suspended = {
      args: { task_id: TASK_ID },
      id: "bg-0",
      runId: "run-0",
    };
    const manager = managerStub({
      listTasks: vi.fn(async () => ({ tasks: [suspended], total: 1 })),
    });

    const started = await startTaskJob(mastraWith(manager), INPUT);

    expect(manager.resume).toHaveBeenCalledWith("bg-0", undefined);
    expect(manager.enqueue).not.toHaveBeenCalled();
    // Same run id — which is what keeps a task's history one run across an
    // answer rather than one run per round-trip.
    expect(started.runId).toBe("run-0");
  });

  // Regression (2026-08-22, goal 01a02926): approving a parked tasks_create
  // executed it twice — the resumed model both repeated the prepared call and
  // re-issued a fresh one (ENG-22 + ENG-23). The recorded call must ride the
  // suspend payload into the resume, where it is replayed exactly once.
  it("hands the parked run's recorded gated calls back in through resumeData", async () => {
    const pendingCall = {
      input: { title: "Glossar erstellen" },
      operation_id: "tasks_create",
      title: "Create task",
    };
    const suspended = {
      args: { task_id: TASK_ID },
      id: "bg-0",
      runId: "run-0",
      suspendPayload: { pending_calls: [pendingCall], task_id: TASK_ID },
    };
    const manager = managerStub({
      listTasks: vi.fn(async () => ({ tasks: [suspended], total: 1 })),
    });

    await startTaskJob(mastraWith(manager), INPUT);

    expect(manager.resume).toHaveBeenCalledTimes(1);
    expect(manager.resume).toHaveBeenCalledWith("bg-0", {
      approved_calls: [pendingCall],
    });
  });

  it("ignores a suspended run belonging to a different task", async () => {
    const manager = managerStub({
      listTasks: vi.fn(async () => ({
        tasks: [{ args: { task_id: "other" }, id: "bg-9", runId: "run-9" }],
        total: 1,
      })),
    });

    await startTaskJob(mastraWith(manager), INPUT);

    expect(manager.resume).not.toHaveBeenCalled();
    expect(manager.enqueue).toHaveBeenCalled();
  });

  it("falls back to a fresh run when the resume fails", async () => {
    const manager = managerStub({
      listTasks: vi.fn(async () => ({
        tasks: [{ args: { task_id: TASK_ID }, id: "bg-0", runId: "run-0" }],
        total: 1,
      })),
      resume: vi.fn(async () => {
        throw new Error("snapshot gone");
      }),
    });

    const started = await startTaskJob(mastraWith(manager), INPUT);

    expect(manager.enqueue).toHaveBeenCalled();
    expect(started.runId).not.toBe("run-0");
  });

  it("falls back to a fresh run when the lookup itself fails", async () => {
    const manager = managerStub({
      listTasks: vi.fn(async () => {
        throw new Error("storage down");
      }),
    });

    await startTaskJob(mastraWith(manager), INPUT);

    expect(manager.enqueue).toHaveBeenCalled();
  });
});

describe("the registered executor", () => {
  function executorFor(manager: ReturnType<typeof managerStub>) {
    registerTaskJobExecutor(mastraWith(manager));
    return manager.registerStaticExecutor.mock.calls.at(0)?.at(1) as {
      execute: (
        args: Record<string, unknown>,
        options?: {
          resumeData?: unknown;
          suspend?: (data?: unknown) => Promise<void>;
        }
      ) => Promise<unknown>;
    };
  }

  it("suspends only when the run stopped for a person", async () => {
    const manager = managerStub();
    const executor = executorFor(manager);
    const suspend = vi.fn(async () => undefined);

    runTaskJobPipeline.mockResolvedValue({
      envelope: { status: "released" },
      waitedOnAPerson: true,
    });
    await executor.execute({ ...INPUT, __run_id: "run-1" }, { suspend });
    expect(suspend).toHaveBeenCalledWith({ task_id: TASK_ID });

    suspend.mockClear();
    runTaskJobPipeline.mockResolvedValue({
      envelope: { status: "released" },
      waitedOnAPerson: false,
    });
    await executor.execute({ ...INPUT, __run_id: "run-2" }, { suspend });
    expect(suspend).not.toHaveBeenCalled();
  });

  it("parks with the recorded gated calls in the suspend payload", async () => {
    const manager = managerStub();
    const executor = executorFor(manager);
    const suspend = vi.fn(async () => undefined);

    runTaskJobPipeline.mockResolvedValue({
      envelope: {
        pending_approvals: [
          {
            input: { title: "Glossar erstellen" },
            operation_id: "tasks_create",
            risk_level: "high",
            title: "Create task",
          },
        ],
        status: "released",
      },
      waitedOnAPerson: true,
    });
    await executor.execute({ ...INPUT, __run_id: "run-1" }, { suspend });

    expect(suspend).toHaveBeenCalledWith({
      pending_calls: [
        {
          input: { title: "Glossar erstellen" },
          operation_id: "tasks_create",
          title: "Create task",
        },
      ],
      task_id: TASK_ID,
    });
  });

  it("threads resumeData's approved calls into the pipeline — and only those", async () => {
    const manager = managerStub();
    const executor = executorFor(manager);
    const approved = [
      { input: { title: "Glossar" }, operation_id: "tasks_create" },
    ];

    await executor.execute(
      { ...INPUT, __run_id: "run-1" },
      { resumeData: { approved_calls: approved } }
    );
    expect(runTaskJobPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: TASK_ID }),
      "run-1",
      expect.objectContaining({ approvedResumeCalls: approved })
    );

    // A fresh dispatch (no resumeData) must never carry a replay — even if
    // someone smuggled approved calls into the enqueue args.
    runTaskJobPipeline.mockClear();
    await executor.execute({
      ...INPUT,
      __run_id: "run-2",
      approved_resume_calls: approved,
    });
    const options = runTaskJobPipeline.mock.calls.at(0)?.at(2) as Record<
      string,
      unknown
    >;
    expect(options.approvedResumeCalls).toBeUndefined();
  });

  it("runs to completion where suspending is not offered at all", async () => {
    const manager = managerStub();
    const executor = executorFor(manager);
    runTaskJobPipeline.mockResolvedValue({
      envelope: { status: "released" },
      waitedOnAPerson: true,
    });

    await expect(
      executor.execute({ ...INPUT, __run_id: "run-3" })
    ).resolves.toMatchObject({ status: "released" });
  });

  it("refuses args it cannot make sense of rather than claiming a task", async () => {
    const manager = managerStub();
    const executor = executorFor(manager);

    await expect(executor.execute({ nonsense: true })).rejects.toThrow(
      /args invalid/
    );
    expect(runTaskJobPipeline).not.toHaveBeenCalled();
  });
});

// Mastra 1.59 runs recovery from the Mastra CONSTRUCTOR, before any boot code.
// The config-level tool is the executor that recovery finds; without it, every
// task a crash left running fails "No executor registered" at the next boot.
describe("the recovery tool", () => {
  it("is keyed by the dispatch tool name — recovery resolves by NAME", () => {
    expect(taskJobRecoveryTool.id).toBe(TASK_JOB_TOOL_NAME);
  });

  it("re-enters the pipeline on the run id the crash interrupted", async () => {
    await taskJobRecoveryTool.execute({ ...INPUT, __run_id: "run-crashed" });
    expect(runTaskJobPipeline).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: TASK_ID }),
      "run-crashed",
      expect.anything()
    );
  });

  it("parks tier-2 when the recovered run stops for a person", async () => {
    // Mastra's tool→executor adapter forwards no `suspend`; the recovered run
    // must complete normally (the park already happened inside the pipeline).
    runTaskJobPipeline.mockResolvedValue({
      envelope: { status: "released" },
      waitedOnAPerson: true,
    });
    await expect(
      taskJobRecoveryTool.execute({ ...INPUT, __run_id: "run-crashed" })
    ).resolves.toMatchObject({ status: "released" });
  });
});
