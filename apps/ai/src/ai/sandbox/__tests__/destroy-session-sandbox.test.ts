import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listEngentyDockerSandboxes = vi.fn();
const destroyEngentySandboxById = vi.fn();

vi.mock("../engenty-sandbox-docker.js", () => ({
  listEngentyDockerSandboxes: (input?: { runningOnly?: boolean }) =>
    listEngentyDockerSandboxes(input),
}));
vi.mock("../destroy-engenty-sandbox.js", () => ({
  destroyEngentySandboxById: (id: string) => destroyEngentySandboxById(id),
}));

const { destroySessionLifecycleSandboxes } = await import(
  "../destroy-session-sandbox.js"
);

const THREAD = "019fefba-1421-7a0a-8d61-dbec4497bf7c";
const OTHER = "019fefba-1421-7a0a-8d61-dbec4497bf7d";

function row(sandboxId: string) {
  return {
    container_id: sandboxId,
    container_name: sandboxId,
    created_at_ms: Date.now(),
    sandbox_id: sandboxId,
    state: "running",
  };
}

describe("destroySessionLifecycleSandboxes", () => {
  beforeEach(() => {
    destroyEngentySandboxById.mockResolvedValue(undefined);
  });

  afterEach(() => {
    listEngentyDockerSandboxes.mockReset();
    destroyEngentySandboxById.mockReset();
  });

  it("destroys every agent's container in the thread, not just one", async () => {
    // A copilot chat that delegated to the CLI agent has TWO containers.
    // Deriving a single id from the thread left the sub-agent's running.
    listEngentyDockerSandboxes.mockResolvedValue([
      row(`engenty-session-${THREAD}-engenty.copilot`),
      row(`engenty-session-${THREAD}-engenty.cli`),
    ]);

    await expect(destroySessionLifecycleSandboxes(THREAD)).resolves.toBe(2);
    expect(destroyEngentySandboxById).toHaveBeenCalledWith(
      `engenty-session-${THREAD}-engenty.copilot`
    );
    expect(destroyEngentySandboxById).toHaveBeenCalledWith(
      `engenty-session-${THREAD}-engenty.cli`
    );
  });

  it("leaves another thread's containers alone", async () => {
    listEngentyDockerSandboxes.mockResolvedValue([
      row(`engenty-session-${OTHER}-engenty.cli`),
      row("engenty-run-run-abc"),
    ]);

    await expect(destroySessionLifecycleSandboxes(THREAD)).resolves.toBe(0);
    expect(destroyEngentySandboxById).not.toHaveBeenCalled();
  });

  it("keeps going when one destroy fails", async () => {
    listEngentyDockerSandboxes.mockResolvedValue([
      row(`engenty-session-${THREAD}-engenty.copilot`),
      row(`engenty-session-${THREAD}-engenty.cli`),
    ]);
    destroyEngentySandboxById.mockRejectedValueOnce(new Error("docker down"));

    // Teardown is best-effort at every call site; one wedged container must
    // not strand the others.
    await expect(destroySessionLifecycleSandboxes(THREAD)).resolves.toBe(1);
  });
});
