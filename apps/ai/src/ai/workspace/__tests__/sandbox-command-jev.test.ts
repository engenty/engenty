import { describe, expect, it } from "vitest";
import { jevSaysCommandSafe } from "../sandbox-command-jev.js";

function answering(choice: string, confidence: number) {
  const other = choice === "safe" ? "risky" : "safe";
  return {
    async systemOne() {
      return {
        answers: {
          verdict: {
            choice,
            confidence,
            probabilities: { [choice]: 0.9, [other]: 0.1 },
            type: "choice" as const,
          },
        },
        model: "jev",
      };
    },
  };
}

describe("Jev's verdict on a shell command", () => {
  it("runs only on a confident 'safe'", async () => {
    expect(
      await jevSaysCommandSafe(
        { command: "python3 tidy-a.py" },
        { client: answering("safe", 0.95) }
      )
    ).toBe(true);
  });

  it("asks on 'risky', even a confident one", async () => {
    expect(
      await jevSaysCommandSafe(
        { command: "python3 tidy-b.py" },
        { client: answering("risky", 0.99) }
      )
    ).toBe(false);
  });

  it("asks when the classifier is only guessing", async () => {
    expect(
      await jevSaysCommandSafe(
        { command: "python3 tidy-c.py" },
        { client: answering("safe", 0.5) }
      )
    ).toBe(false);
  });

  it("asks when there is no classifier", async () => {
    expect(
      await jevSaysCommandSafe(
        { command: "python3 tidy-d.py" },
        { client: null }
      )
    ).toBe(false);
  });

  it("asks when the classifier errors, times out or answers nonsense", async () => {
    const throwing = {
      async systemOne(): Promise<never> {
        throw new Error("gateway down");
      },
    };
    const hanging = { systemOne: () => new Promise<never>(() => undefined) };
    const malformed = {
      async systemOne() {
        return { answers: {}, model: "jev" };
      },
    };
    expect(
      await jevSaysCommandSafe({ command: "e1" }, { client: throwing })
    ).toBe(false);
    expect(
      await jevSaysCommandSafe(
        { command: "e2" },
        { client: hanging, timeoutMs: 20 }
      )
    ).toBe(false);
    expect(
      await jevSaysCommandSafe({ command: "e3" }, { client: malformed })
    ).toBe(false);
  });

  it("does not pin a command to 'ask' because of one failure", async () => {
    const command = "python3 flaky.py";
    const down = {
      async systemOne(): Promise<never> {
        throw new Error("gateway down");
      },
    };
    expect(await jevSaysCommandSafe({ command }, { client: down })).toBe(false);
    expect(
      await jevSaysCommandSafe({ command }, { client: answering("safe", 0.95) })
    ).toBe(true);
  });
});
