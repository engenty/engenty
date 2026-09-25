import { describe, expect, it } from "vitest";
import { parseToolApprovalGrantContext } from "../../ai/tools/engenty-tools/lib/tool-approval.js";
import { withToolApprovalGrantOnce } from "../ai/sessions/tool-approval-grants.js";

describe("tool-approval grant context", () => {
  it("drops malformed operation ids, never partially trusts", () => {
    const forged = `tool-approval|${encodeURIComponent("log_time_entry")}|${encodeURIComponent(
      JSON.stringify({
        operation_ids: ["ok_op", "bad op with spaces", 42, "also.ok"],
      })
    )}`;
    expect(parseToolApprovalGrantContext(forged)?.operation_ids).toEqual([
      "ok_op",
      "also.ok",
    ]);
    const empty = `tool-approval|${encodeURIComponent("x")}|${encodeURIComponent(
      JSON.stringify({ operation_ids: ["   "] })
    )}`;
    expect(parseToolApprovalGrantContext(empty)).toBeNull();
  });
});

describe("tool-approval grants metadata", () => {
  // The resume writes this metadata back whole; a dropped key is lost state.
  it("preserves unrelated metadata keys", () => {
    const next = withToolApprovalGrantOnce({ keep: "me" }, "op");
    expect(next.keep).toBe("me");
  });
});
