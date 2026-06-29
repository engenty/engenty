import { describe, expect, it } from "vitest";
import { resolveCopilotWorkContextStableSessionKey } from "./resolve-copilot-work-context.js";

describe("resolveCopilotWorkContextStableSessionKey", () => {
  it("delegates to engenty agent affinity key derivation", () => {
    const key = resolveCopilotWorkContextStableSessionKey({
      agentId: "engenty.copilot",
      routeContext: {
        moduleId: "contacts",
        pathname: "/mdl/contacts/1",
        routeKey: "detail",
        scope: { contact_id: "1" },
      },
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(key).toContain("engenty-agent-affinity");
    expect(key).toContain("engenty.copilot");
    expect(key).toContain("contacts");
  });
});
