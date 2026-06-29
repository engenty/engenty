import { describe, expect, it } from "vitest";
import {
  clearOnceToolApprovalGrants,
  readToolApprovalGrants,
  withToolApprovalGrant,
  withToolApprovalGrantOnce,
} from "../tool-approval-grants.js";

describe("tool-approval-grants", () => {
  it("reads the union of persistent and once grants", () => {
    const meta = withToolApprovalGrantOnce(
      withToolApprovalGrant({}, "always_op"),
      "once_op"
    );
    expect(readToolApprovalGrants(meta).sort()).toEqual([
      "always_op",
      "once_op",
    ]);
  });

  it("a once grant survives resumes but clears on a fresh turn; persistent stays", () => {
    // Approve-once + approve-always are both recorded...
    let meta = withToolApprovalGrant({}, "contacts_update"); // always
    meta = withToolApprovalGrantOnce(meta, "contacts_create"); // once
    // ...and both are in effect for the request's resume runs.
    expect(readToolApprovalGrants(meta).sort()).toEqual([
      "contacts_create",
      "contacts_update",
    ]);
    // A fresh user turn drops the once grant but keeps the persistent one.
    meta = clearOnceToolApprovalGrants(meta);
    expect(readToolApprovalGrants(meta)).toEqual(["contacts_update"]);
  });

  it("grant helpers are idempotent and immutable", () => {
    const base = withToolApprovalGrantOnce({}, "op");
    expect(
      readToolApprovalGrants(withToolApprovalGrantOnce(base, "op"))
    ).toEqual(["op"]);
    // clearing an absent once-bucket is a no-op copy
    expect(readToolApprovalGrants(clearOnceToolApprovalGrants({}))).toEqual([]);
  });
});
