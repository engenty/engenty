import { describe, expect, it } from "vitest";
import { SPACE_CONTRACT_PROMPT } from "../space-contract-prompt.js";

describe("SPACE_CONTRACT_PROMPT", () => {
  it("distinguishes the tenant boundary from the active Space", () => {
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "Tenant is the organization and authorization boundary"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "Active Space is where this run works"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "Runtime `current_space` and `space_mounted_modules` are authoritative"
    );
  });

  it("distinguishes catalog contracts from record data", () => {
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "return catalog contracts, not records"
    );
  });

  it("requires successful execute evidence before stating record facts", () => {
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "only after `engenty_tool_execute` returns `ok: true` with readable `data`"
    );
  });

  it("requires exact reporting for empty, error, and unreadable results", () => {
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "an error, an empty result, or no readable result, report exactly that"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "Never invent names, IDs, rows, amounts, statuses, email addresses, or URLs"
    );
  });

  it("keeps /data as module records, not a note dump", () => {
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "`/data` is this Space's module records"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain("observational memory");
    expect(SPACE_CONTRACT_PROMPT).not.toContain("/data/Files");
  });

  it("defines Space and workspace without making either a driver", () => {
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "A Space selects the apps, agents, connections, skills, and module data"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "not a driver, queue, or scheduler"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "A workspace is run context and files, not a queue or module database"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "Files and artifacts are real deliverable stores and review surfaces"
    );
  });

  it("describes only conditional named workspace mounts", () => {
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "use only the named mounts exposed in this run"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "exactly one of `/shared` (tenant context) or `/space`"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "`/task` and `/project` exist only when those bindings resolve"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "`/skills` is the read-only skill library"
    );
  });

  it("defines unmounted and read-only refusal semantics", () => {
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "An unmounted app can still exist in Engenty"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "Do not retry an unmounted or read-only refusal"
    );
  });

  it("names the space-owned, tenant-shared, and account-scoped categories", () => {
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "Space-owned records default to current_space"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "Tenant-shared apps use the tenant library after the app is mounted"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "Account-scoped apps use only accounts mounted here"
    );
  });

  it("requires canonical Space navigation through the navigate tool", () => {
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "prefer canonical `/s/<space_key>/…` routes"
    );
    expect(SPACE_CONTRACT_PROMPT).toContain(
      "let `navigate` resolve the real route table"
    );
  });
});
