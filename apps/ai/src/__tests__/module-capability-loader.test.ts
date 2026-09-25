import { describe, expect, it } from "vitest";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { createDefaultModuleCapabilityLoader } from "../ai/module-capability-loader.js";

function coreCatalog(url: string): Response {
  if (url.endsWith("/api/users/setup/context")) {
    return Response.json({
      data: { currentTenant: { id: "tenant-1" }, userId: "user-1" },
      ok: true,
    });
  }
  if (url.endsWith("/api/plugins?tenantId=tenant-1")) {
    return Response.json({
      data: [
        { id: "leads", kind: "module", loaded: true },
        { id: "contacts", kind: "module", loaded: true, tenantEnabled: false },
        {
          effectiveState: { allowed: false },
          id: "invoices",
          kind: "module",
          loaded: true,
        },
      ],
      ok: true,
    });
  }
  if (url.endsWith("/api/tools/contracts")) {
    return Response.json({
      data: ["leads", "contacts", "invoices"].map((moduleId) => ({
        auth: { riskLevel: "low" },
        description: `Load one ${moduleId} record.`,
        moduleId,
        operationId: `${moduleId}_get`,
      })),
      ok: true,
    });
  }
  if (url.endsWith("/api/tools/module-capabilities")) {
    return Response.json({ data: { capabilities: [] }, ok: true });
  }
  return Response.json({ ok: false }, { status: 404 });
}

describe("module capability loader", () => {
  it("offers no tools from modules the tenant disabled or may not use", async () => {
    const capabilities = await engentyToolsRunAls.run(
      {
        accessToken: "user-token",
        coreBaseUrl: "https://core.example.test",
        fetchImpl: (async (input: RequestInfo | URL) =>
          coreCatalog(String(input))) as typeof fetch,
      },
      () => createDefaultModuleCapabilityLoader().listModuleCapabilities()
    );

    expect(
      capabilities.flatMap((capability) => Object.keys(capability.tools ?? {}))
    ).toEqual(["leads_get"]);
  });
});
