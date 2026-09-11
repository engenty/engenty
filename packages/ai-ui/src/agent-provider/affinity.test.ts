import { describe, expect, it } from "vitest";
import { resolveEngentyAgentAffinityStableSessionKey } from "./affinity.js";

describe("resolveEngentyAgentAffinityStableSessionKey", () => {
  it("creates a deterministic work-context key with normalized scope order", () => {
    const left = resolveEngentyAgentAffinityStableSessionKey({
      agentId: "engenty.copilot",
      routeContext: {
        moduleId: "contacts",
        pathname: "/mdl/contacts/1",
        routeKey: "detail",
        scope: {
          contact_id: "1",
          filters: { b: true, a: false },
        },
      },
      tenantId: "tenant-1",
      userId: "user-1",
    });
    const right = resolveEngentyAgentAffinityStableSessionKey({
      agentId: "engenty.copilot",
      routeContext: {
        moduleId: "contacts",
        pathname: "/mdl/contacts/1",
        routeKey: "detail",
        scope: {
          filters: { a: false, b: true },
          contact_id: "1",
        },
      },
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(left).toBe(right);
    expect(left).toBe(
      'engenty-agent-affinity:v1:tenant-1:user-1:engenty.copilot:contacts:detail:/mdl/contacts/1:{"contact_id":"1","filters":{"a":false,"b":true}}'
    );
  });

  it("keeps explicit multi-pane keys distinct when callers vary route scope", () => {
    const first = resolveEngentyAgentAffinityStableSessionKey({
      agentId: "engenty.copilot",
      routeContext: {
        moduleId: "engenty-copilot",
        routeKey: "tab",
        scope: { tab_id: "a" },
      },
      tenantId: "tenant-1",
      userId: "user-1",
    });
    const second = resolveEngentyAgentAffinityStableSessionKey({
      agentId: "engenty.copilot",
      routeContext: {
        moduleId: "engenty-copilot",
        routeKey: "tab",
        scope: { tab_id: "b" },
      },
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(first).not.toBe(second);
  });

  it("refuses to create an affinity key until tenant, user, agent, and route identity are ready", () => {
    expect(
      resolveEngentyAgentAffinityStableSessionKey({
        agentId: "engenty.copilot",
        routeContext: { moduleId: "engenty-copilot", routeKey: "chat" },
        tenantId: "",
        userId: "user-1",
      })
    ).toBeNull();
    expect(
      resolveEngentyAgentAffinityStableSessionKey({
        agentId: "",
        routeContext: { moduleId: "engenty-copilot", routeKey: "chat" },
        tenantId: "tenant-1",
        userId: "user-1",
      })
    ).toBeNull();
  });

  it("keeps affinity keys within the ai session stable key limit for task snapshots", () => {
    const key = resolveEngentyAgentAffinityStableSessionKey({
      agentId: "tasks.assist",
      routeContext: {
        moduleId: "tasks",
        pathname: "/mdl/tasks/task-1",
        routeKey: "detail",
        scope: {
          currentModule: "tasks",
          entityId: "task-1",
          task_id: "task-1",
          task_identifier: "ENG-1",
          task_snapshot: {
            checkout_run_id: null,
            comment_count: 12,
            description: "x".repeat(800),
            due_date: null,
            identifier: "ENG-1",
            primary_assignee_agent_id: null,
            primary_assignee_kind: "user",
            primary_assignee_user_id: "user-2",
            priority: "normal",
            recent_comments: [{ content: "y".repeat(200) }],
            status: "in_progress",
            title: "Large task title",
          },
        },
      },
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(key).not.toBeNull();
    expect(key?.length ?? 0).toBeLessThanOrEqual(512);
    expect(key).toContain("task_id");
    expect(key).not.toContain("task_snapshot");
  });
});
