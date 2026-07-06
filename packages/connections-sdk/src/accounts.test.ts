import { describe, expect, it } from "vitest";
import {
  describeSelectionFailure,
  selectConnectionForAccount,
} from "./accounts.js";
import type { ConnectionSummary } from "./types.js";

function connection(
  overrides: Partial<ConnectionSummary> & { id: string }
): ConnectionSummary {
  return {
    auth_kind: "oauth2",
    autonomous_mode: "off",
    connector_id: "google-gmail",
    created_at: "2026-07-04T00:00:00Z",
    display_name: null,
    error_message: null,
    external_account: null,
    granted_scopes: [],
    non_owner_max_group: null,
    owner_user_id: "user-1",
    sharing: "personal",
    status: "active",
    tenant_id: "tenant-1",
    ...overrides,
  };
}

const personalGmail = connection({
  external_account: "alice@example.com",
  id: "c-personal",
});
const orgGmail = connection({
  display_name: "Office mailbox",
  external_account: "office@example.com",
  id: "c-org",
  owner_user_id: "admin-1",
  sharing: "org",
});

describe("selectConnectionForAccount", () => {
  it("fails with connection_not_connected on zero candidates", () => {
    const result = selectConnectionForAccount({ candidates: [] });
    expect(result).toEqual({
      candidates: [],
      code: "connection_not_connected",
      ok: false,
    });
  });

  it("uses the only candidate when no account is given (backward compatible)", () => {
    const result = selectConnectionForAccount({
      candidates: [personalGmail],
    });
    expect(result).toEqual({ connection: personalGmail, ok: true });
  });

  it("is ambiguous without an account when several candidates exist", () => {
    const result = selectConnectionForAccount({
      candidates: [personalGmail, orgGmail],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("connection_ambiguous");
      expect(result.candidates.map((c) => c.connection_id)).toEqual([
        "c-personal",
        "c-org",
      ]);
      expect(result.candidates[1]).toEqual({
        account: "office@example.com",
        connection_id: "c-org",
        display_name: "Office mailbox",
        sharing: "org",
      });
    }
  });

  it("matches by case-insensitive substring of the external account", () => {
    const result = selectConnectionForAccount({
      account: "OFFICE",
      candidates: [personalGmail, orgGmail],
    });
    expect(result).toEqual({ connection: orgGmail, ok: true });
  });

  it("matches by display name too", () => {
    const result = selectConnectionForAccount({
      account: "mailbox",
      candidates: [personalGmail, orgGmail],
    });
    expect(result).toEqual({ connection: orgGmail, ok: true });
  });

  it("fails with connection_account_not_found when nothing matches", () => {
    const result = selectConnectionForAccount({
      account: "support",
      candidates: [personalGmail, orgGmail],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("connection_account_not_found");
      // all candidates listed so the caller can self-correct
      expect(result.candidates).toHaveLength(2);
    }
  });

  it("stays ambiguous when the account matches several candidates", () => {
    const result = selectConnectionForAccount({
      account: "example.com",
      candidates: [personalGmail, orgGmail],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("connection_ambiguous");
      expect(result.candidates).toHaveLength(2);
    }
  });

  it("treats a blank account like no account", () => {
    const result = selectConnectionForAccount({
      account: "  ",
      candidates: [personalGmail],
    });
    expect(result).toEqual({ connection: personalGmail, ok: true });
  });
});

describe("describeSelectionFailure", () => {
  it("lists candidate labels for ambiguity", () => {
    const selection = selectConnectionForAccount({
      candidates: [personalGmail, orgGmail],
    });
    if (selection.ok) {
      throw new Error("expected failure");
    }
    const message = describeSelectionFailure(selection, "Gmail");
    expect(message).toContain("alice@example.com");
    expect(message).toContain("Office mailbox");
    expect(message).toContain('pass "account"');
  });
});
