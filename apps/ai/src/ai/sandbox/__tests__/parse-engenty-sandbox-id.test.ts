import { describe, expect, it } from "vitest";
import { parseEngentySandboxId } from "../parse-engenty-sandbox-id.js";

const threadId = "00000000-0000-4000-8000-000000000003";

describe("parseEngentySandboxId", () => {
  it("splits a session id into its thread and agent", () => {
    // The agent id may contain dashes and dots, so the split is by the
    // thread's fixed UUID shape rather than by the last separator.
    expect(
      parseEngentySandboxId(`engenty-session-${threadId}-engenty.cli`)
    ).toMatchObject({
      agent_id: "engenty.cli",
      lifecycle: "session",
      scope_key: `session-${threadId}-engenty.cli`,
      thread_id: threadId,
    });
  });

  it("still parses a container created before the agent was in the key", () => {
    // Such a container is unreachable by thread, so a close cannot target it —
    // the age sweep is what clears the ones left on a host at deploy time.
    expect(parseEngentySandboxId(`engenty-session-${threadId}`)).toMatchObject({
      agent_id: null,
      lifecycle: "session",
      thread_id: null,
    });
  });

  it("parses run lifecycle ids without thread id", () => {
    expect(parseEngentySandboxId("engenty-run-run-abc")).toMatchObject({
      lifecycle: "run",
      scope_suffix: "run-abc",
      thread_id: null,
    });
  });

  it("parses a space computer id into its tenant and space", () => {
    const tenant = "00000000-0000-4000-8000-0000000000aa";
    const space = "00000000-0000-4000-8000-0000000000bb";
    expect(
      parseEngentySandboxId(`engenty-space-${tenant}-${space}`)
    ).toMatchObject({
      lifecycle: "space",
      scope_key: `space-${tenant}-${space}`,
      space_id: space,
      tenant_id: tenant,
      thread_id: null,
    });
  });

  it("parses a space browser id into its tenant and space", () => {
    const tenant = "00000000-0000-4000-8000-0000000000aa";
    const space = "00000000-0000-4000-8000-0000000000bb";
    const parsed = parseEngentySandboxId(`engenty-browser-${tenant}-${space}`);
    expect(parsed).toMatchObject({
      agent_id: null,
      lifecycle: "browser",
      space_id: space,
      tenant_id: tenant,
      thread_id: null,
    });
    expect(parsed).not.toHaveProperty("user_id");
  });

  it("does not read a browser id with more than two UUIDs", () => {
    const tenant = "00000000-0000-4000-8000-0000000000aa";
    const space = "00000000-0000-4000-8000-0000000000bb";
    const extra = "00000000-0000-4000-8000-0000000000cc";
    expect(
      parseEngentySandboxId(`engenty-browser-${tenant}-${space}-${extra}`)
    ).toMatchObject({ lifecycle: "browser", space_id: null, tenant_id: null });
  });

  it("does not read a space computer id with more than two UUIDs", () => {
    const tenant = "00000000-0000-4000-8000-0000000000aa";
    const space = "00000000-0000-4000-8000-0000000000bb";
    const extra = "00000000-0000-4000-8000-0000000000cc";
    expect(
      parseEngentySandboxId(`engenty-space-${tenant}-${space}-${extra}`)
    ).toMatchObject({ lifecycle: "space", space_id: null, tenant_id: null });
  });

  it("rejects non-engenty ids", () => {
    expect(parseEngentySandboxId("docker-sandbox-abc")).toBeNull();
  });
});
