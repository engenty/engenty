import { afterEach, describe, expect, it, vi } from "vitest";

const runSupabaseCli = vi.fn();
const runSupabaseCliStreaming = vi.fn();

vi.mock("./run-supabase-cli.js", () => ({
  runSupabaseCli: (args: readonly string[]) => runSupabaseCli(args),
  runSupabaseCliStreaming: (args: readonly string[]) =>
    runSupabaseCliStreaming(args),
}));

const { restartLocalDb } = await import("./db-commands.js");

describe("restartLocalDb", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    runSupabaseCli.mockReset();
    runSupabaseCliStreaming.mockReset();
  });

  it("stops the stack, then streams start so config.toml is reloaded", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    runSupabaseCli.mockReturnValue({ ok: true, output: "" });
    runSupabaseCliStreaming.mockReturnValue({ ok: true });

    restartLocalDb();

    expect(runSupabaseCli).toHaveBeenCalledWith(["stop"]);
    expect(runSupabaseCliStreaming).toHaveBeenCalledWith(["start"]);
    // stop must precede start
    expect(runSupabaseCli.mock.invocationCallOrder[0]).toBeLessThan(
      runSupabaseCliStreaming.mock.invocationCallOrder[0]
    );
  });

  it("throws when the stack fails to start again", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    runSupabaseCli.mockReturnValue({ ok: true, output: "" });
    runSupabaseCliStreaming.mockReturnValue({ ok: false });

    expect(() => restartLocalDb()).toThrow("supabase start failed.");
  });
});
