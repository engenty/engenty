import { describe, expect, it, vi } from "vitest";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { createDefaultModuleCapabilityLoader } from "../ai/module-capability-loader.js";

describe("module capability loader", () => {
  it("loads module tool capabilities from core plugin and tool catalogs", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init) => {
      const url = String(input);
      if (url.endsWith("/api/users/setup/context")) {
        return Response.json({
          data: {
            canSwitchTenant: false,
            currentTenant: { id: "tenant-1", name: "Tenant" },
            isSuperAdmin: false,
            isTenantAdmin: false,
            onboarded: true,
            tenantRole: "member",
            userId: "user-1",
          },
          ok: true,
        });
      }
      if (url.endsWith("/api/plugins?tenantId=tenant-1")) {
        return Response.json({
          data: [
            {
              description: "Leads and sales pipeline module",
              id: "leads",
              kind: "module",
              loaded: true,
              name: "Leads",
              provides: ["module.leads", "ui.route.module.leads"],
            },
            {
              description: "Project management module",
              id: "projects",
              kind: "module",
              loaded: true,
              name: "Projects",
              provides: ["module.projects", "ui.route.module.projects"],
            },
            {
              description: "Disabled optional module",
              id: "contacts",
              kind: "module",
              loaded: true,
              name: "Contacts",
              provides: ["module.contacts"],
              tenantEnabled: false,
            },
          ],
          ok: true,
        });
      }
      if (url.endsWith("/api/tools/contracts")) {
        return Response.json({
          data: [
            {
              auth: { riskLevel: "low" },
              description: "Load one lead.",
              inputSchema: { jsonSchema: { type: "object" } },
              moduleId: "leads",
              operationId: "leads_get",
              summary: "Load lead",
            },
            {
              auth: { riskLevel: "low" },
              description: "List leads.",
              moduleId: "leads",
              operationId: "leads_list",
              summary: "List leads",
            },
            {
              auth: { riskLevel: "low" },
              description: "Load one project.",
              moduleId: "projects",
              operationId: "projects_get",
              summary: "Load project",
            },
            {
              auth: { riskLevel: "low" },
              description: "Load one contact.",
              moduleId: "contacts",
              operationId: "contacts_get",
              summary: "Load contact",
            },
          ],
          ok: true,
        });
      }
      if (url.endsWith("/api/tools/module-capabilities")) {
        return Response.json({
          data: {
            capabilities: [
              {
                moduleId: "leads",
                agentConfigs: [
                  {
                    id: "leads.manager",
                    instructions: "Manage leads.",
                    model: "openai/gpt-4.1-mini",
                    name: "Leads Manager",
                    skillIds: [],
                    source: "module",
                    toolIds: ["leads_get"],
                  },
                ],
                actions: [
                  {
                    agent_id: "leads.manager",
                    default_thread_mode: "new",
                    id: "leads.briefing",
                    input_schema_json: { type: "object", properties: {} },
                    module_id: "leads",
                    name: "Lead briefing",
                    prompt: "Prepare a lead briefing.",
                  },
                ],
                routines: [
                  {
                    enabled_by_default: true,
                    id: "leads.daily-digest",
                    module_id: "leads",
                    name: "Daily leads digest",
                    schedule: "0 7 * * *",
                    target: { agent_id: "leads.manager", kind: "agent_prompt" },
                  },
                ],
              },
            ],
          },
          ok: true,
        });
      }
      if (url.endsWith("/api/tools/leads_get/invoke")) {
        expect(init?.body).toBe(JSON.stringify({ input: { id: "lead-1" } }));
        return Response.json({
          data: { id: "lead-1", title: "CRM rollout" },
          ok: true,
        });
      }
      return Response.json(
        { error: { code: "not_found", message: url }, ok: false },
        { status: 404 }
      );
    });

    const capabilities = await engentyToolsRunAls.run(
      {
        coreBaseUrl: "https://core.example.test",
        fetchImpl: fetchImpl as typeof fetch,
        userAccessToken: "user-token",
      },
      () => createDefaultModuleCapabilityLoader().listModuleCapabilities()
    );

    expect(capabilities.map((capability) => capability.moduleId)).toEqual([
      "leads",
      "projects",
    ]);
    const leadsCapability = capabilities.find(
      (capability) => capability.moduleId === "leads"
    );

    expect(leadsCapability?.agentConfigs?.[0]?.id).toBe("leads.manager");
    expect(leadsCapability?.tools).toHaveProperty("leads_get");
    expect(leadsCapability?.tools).toHaveProperty("leads_list");
    expect(leadsCapability?.actions?.map((action) => action.id)).toEqual([
      "leads.briefing",
    ]);
    expect(leadsCapability?.routines?.map((routine) => routine.id)).toEqual([
      "leads.daily-digest",
    ]);

    const projectCapability = capabilities.find(
      (capability) => capability.moduleId === "projects"
    );
    expect(projectCapability?.agentConfigs).toBeUndefined();
    expect(projectCapability?.tools).toHaveProperty("projects_get");
    expect(capabilities).not.toContainEqual(
      expect.objectContaining({ moduleId: "contacts" })
    );

    const leadTool = leadsCapability?.tools?.leads_get as
      | { execute: (input: { id: string }) => Promise<unknown> }
      | undefined;
    const result = await engentyToolsRunAls.run(
      {
        coreBaseUrl: "https://core.example.test",
        fetchImpl: fetchImpl as typeof fetch,
        userAccessToken: "user-token",
      },
      () => leadTool?.execute({ id: "lead-1" })
    );

    expect(result).toEqual({ id: "lead-1", title: "CRM rollout" });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://core.example.test/api/tools/leads_get/invoke"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer user-token",
        }),
        method: "POST",
      })
    );
    expect(
      fetchImpl.mock.calls.some(([url]) =>
        String(url).includes("/api/admin/ai/agents")
      )
    ).toBe(false);
  });
});
