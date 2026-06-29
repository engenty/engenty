import { describe, expect, it } from "vitest";
import { parseEngentySandboxId } from "../parse-engenty-sandbox-id.js";

const threadId = "00000000-0000-4000-8000-000000000003";

describe("parseEngentySandboxId", () => {
  it("parses session lifecycle ids into thread ids", () => {
    expect(parseEngentySandboxId(`engenty-session-${threadId}`)).toMatchObject({
      lifecycle: "session",
      scope_key: `session-${threadId}`,
      thread_id: threadId,
    });
  });

  it("parses run lifecycle ids without thread id", () => {
    expect(parseEngentySandboxId("engenty-run-run-abc")).toMatchObject({
      lifecycle: "run",
      scope_suffix: "run-abc",
      thread_id: null,
    });
  });

  it("rejects non-engenty ids", () => {
    expect(parseEngentySandboxId("docker-sandbox-abc")).toBeNull();
  });
});
