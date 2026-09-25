import { describe, expect, it } from "vitest";
import {
  clearOnceToolApprovalGrants,
  readToolApprovalGrants,
  withToolApprovalGrantOnce,
} from "../tool-approval-grants.js";

describe("tool-approval-grants", () => {
  it("a once grant survives resumes but clears on a fresh turn", () => {
    const meta = withToolApprovalGrantOnce({}, "contacts_create");
    expect(readToolApprovalGrants(meta)).toEqual(["contacts_create"]);
    expect(readToolApprovalGrants(clearOnceToolApprovalGrants(meta))).toEqual(
      []
    );
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
