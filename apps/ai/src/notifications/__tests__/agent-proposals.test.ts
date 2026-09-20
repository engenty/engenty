import { beforeEach, describe, expect, it, vi } from "vitest";

const emitInboxNotification = vi.fn<(input: unknown) => Promise<null>>(
  async () => null
);
const resolveNotifications = vi.fn<(input: unknown) => Promise<number>>(
  async () => 1
);
vi.mock("../inbox.js", () => ({
  emitInboxNotification: (input: unknown) => emitInboxNotification(input),
  resolveNotifications: (input: unknown) => resolveNotifications(input),
}));

const { notifyAgentProposed, resolveAgentProposalNotifications } = await import(
  "../agent-proposals.js"
);

const SPACE_ID = "00000000-0000-4000-8000-000000000010";

beforeEach(() => {
  emitInboxNotification.mockClear();
  resolveNotifications.mockClear();
});

describe("notifyAgentProposed", () => {
  it("files a space-scoped decision about the agent, not the chat card", async () => {
    await notifyAgentProposed({
      agentId: "apps.builder",
      agentName: "App Coder",
      pendingRevision: false,
      proposedByAgent: "chief-of-staff",
      spaceId: SPACE_ID,
      tenantId: "tenant-1",
    });
    expect(emitInboxNotification).toHaveBeenCalledOnce();
    expect(emitInboxNotification.mock.calls[0]?.[0]).toMatchObject({
      actor: { id: "chief-of-staff", kind: "agent" },
      dedupeKey: "agent-proposal:tenant-1:apps.builder",
      kind: "agent_proposed",
      spaceId: SPACE_ID,
      subject: { id: "apps.builder", type: "agent" },
      summary: expect.stringContaining("App Coder"),
    });
  });

  it("names a revision as a revision", async () => {
    await notifyAgentProposed({
      agentId: "apps.builder",
      agentName: "App Coder",
      pendingRevision: true,
      proposedByAgent: "apps.builder",
      spaceId: null,
      tenantId: "tenant-1",
    });
    expect(emitInboxNotification.mock.calls[0]?.[0]).toMatchObject({
      summary: expect.stringContaining("revision"),
      spaceId: null,
    });
  });
});

describe("resolveAgentProposalNotifications", () => {
  it("closes the proposal by agent subject", async () => {
    await resolveAgentProposalNotifications({
      agentId: "apps.builder",
      tenantId: "tenant-1",
    });
    expect(resolveNotifications).toHaveBeenCalledWith({
      outcome: "decided",
      subjectId: "apps.builder",
      subjectType: "agent",
      tenantId: "tenant-1",
    });
  });
});
