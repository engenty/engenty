import { describe, expect, it } from "vitest";
import { appHostId } from "./app-host-client.js";

/** agentOS rejects anything longer, and does so as an opaque build failure. */
const AGENTOS_APP_ID_MAX = 63;
const AGENTOS_APP_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

describe("appHostId", () => {
  const TENANT = "019f8fdc-fddd-77d7-941a-3ae10d57d06e";
  const APP = "019f9d3e-d7c9-77c4-8c2f-97f52273c37b";

  it("fits agentOS's id limit for real uuid pairs", () => {
    const id = appHostId(TENANT, APP);
    // Two full 32-char UUIDs plus separators would be 69 — every real App
    // failed to deploy until this was shortened.
    expect(id.length).toBeLessThanOrEqual(AGENTOS_APP_ID_MAX);
    expect(id).toMatch(AGENTOS_APP_ID_RE);
  });

  it("keeps the app uuid whole, since that is what makes the id unique", () => {
    expect(appHostId(TENANT, APP)).toContain(
      "019f9d3ed7c977c48c2f97f52273c37b"
    );
  });

  it("separates two apps in one tenant, and one app across two tenants", () => {
    const other = "019f9d3e-d7c9-77c4-8c2f-000000000000";
    expect(appHostId(TENANT, APP)).not.toBe(appHostId(TENANT, other));
    expect(appHostId(TENANT, APP)).not.toBe(
      appHostId("019f0000-0000-77d7-941a-3ae10d57d06e", APP)
    );
  });

  it("stays within the limit even for over-long inputs", () => {
    const id = appHostId("T".repeat(200), "A".repeat(200));
    expect(id.length).toBeLessThanOrEqual(AGENTOS_APP_ID_MAX);
    expect(id).toMatch(AGENTOS_APP_ID_RE);
  });
});
