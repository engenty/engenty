import { describe, expect, it } from "vitest";
import {
  parseDockerCreatedAtMs,
  parseDockerPsJsonLines,
} from "../engenty-sandbox-docker.js";

describe("parseDockerPsJsonLines", () => {
  it("extracts engenty sandbox rows from docker ps json output", () => {
    const stdout = [
      JSON.stringify({
        CreatedAt: "2026-08-28 10:12:33 +0200 CEST",
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
        created_at_ms: Date.parse("2026-08-28T10:12:33+02:00"),
        sandbox_id: "engenty-session-thread-1",
        state: "running",
      },
    ]);
  });
});

describe("parseDockerCreatedAtMs", () => {
  it("reads docker's stamp past the trailing zone abbreviation", () => {
    expect(parseDockerCreatedAtMs("2026-08-28 10:12:33 +0200 CEST")).toBe(
      Date.parse("2026-08-28T10:12:33+02:00")
    );
    expect(parseDockerCreatedAtMs("2026-08-28 08:12:33 +0000 UTC")).toBe(
      Date.parse("2026-08-28T08:12:33Z")
    );
  });

  it("returns null rather than guessing when there is no offset", () => {
    // The only consumer destroys containers; a stamp read hours wrong could
    // destroy a live one.
    expect(parseDockerCreatedAtMs("2026-08-28 10:12:33")).toBeNull();
    expect(parseDockerCreatedAtMs("")).toBeNull();
    expect(parseDockerCreatedAtMs(undefined)).toBeNull();
  });
});
