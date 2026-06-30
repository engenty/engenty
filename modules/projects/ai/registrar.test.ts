import { unregisterAiRegistration } from "@engenty/ai-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  projectsAiRegistration,
  projectsDynamicAiCapability,
} from "./registrar.js";

const noopInvokeProjectsOperation = vi.fn(async () => null);

describe("projectsAiRegistration", () => {
  afterEach(() => {
    unregisterAiRegistration("projects");
  });

  it("exposes no specialist agents (workforce plan R1)", () => {
    const registration = projectsAiRegistration({
      invokeProjectsOperation: noopInvokeProjectsOperation,
    });
    expect(registration.agents ?? []).toHaveLength(0);
  });

  it("exposes projects tools as a dynamic module capability", async () => {
    const invokeProjectsOperation = vi.fn(
      async (name: string, input: unknown) => {
        if (name === "projects_get") {
          expect(input).toEqual({ id: "proj-1" });
          return { id: "proj-1", title: "Website launch" };
        }
        expect(name).toBe("projects_list");
        expect(input).toEqual({ search: "launch" });
        return { items: [{ id: "proj-1", title: "Website launch" }] };
      }
    );
    const capability = projectsDynamicAiCapability({ invokeProjectsOperation });

    expect(capability.moduleId).toBe("projects");
    expect(capability.agentConfigs ?? []).toHaveLength(0);
    expect(capability.tools).toHaveProperty("load_project");
    expect(capability.tools).toHaveProperty("load_projects_list");

    await expect(
      (
        capability.tools?.load_project as {
          execute: (input: { id: string }) => Promise<unknown>;
        }
      ).execute({ id: "proj-1" })
    ).resolves.toEqual({ id: "proj-1", title: "Website launch" });
    await expect(
      (
        capability.tools?.load_projects_list as {
          execute: (input: { search: string }) => Promise<unknown>;
        }
      ).execute({ search: "launch" })
    ).resolves.toEqual({
      items: [{ id: "proj-1", title: "Website launch" }],
    });
  });
});
