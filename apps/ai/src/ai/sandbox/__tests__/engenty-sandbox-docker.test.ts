import { describe, expect, it } from "vitest";
import { parseDockerPsJsonLines } from "../engenty-sandbox-docker.js";

describe("parseDockerPsJsonLines", () => {
  it("extracts engenty sandbox rows from docker ps json output", () => {
    const stdout = [
      JSON.stringify({
        ID: "abc123",
        Labels:
          "mastra.sandbox=true,mastra.sandbox.id=engenty-session-thread-1",
        Names: "/engenty-session-thread-1",
        State: "running",
      }),
      JSON.stringify({
        ID: "def456",
        Labels: "mastra.sandbox=true,mastra.sandbox.id=other-sandbox",
        Names: "/other",
        State: "running",
      }),
    ].join("\n");

    expect(parseDockerPsJsonLines(stdout)).toEqual([
      {
        container_id: "abc123",
        container_name: "engenty-session-thread-1",
        sandbox_id: "engenty-session-thread-1",
        state: "running",
      },
    ]);
  });
});
