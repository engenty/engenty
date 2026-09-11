import { describe, expect, it } from "vitest";
import {
  optimisticProject,
  projectMatchesList,
} from "./optimistic-mutations.js";

describe("project optimistic reducers", () => {
  it("creates a renderable temporary project", () => {
    const project = optimisticProject(
      { client_id: null, client_name: null, title: "Immediate" },
      "opt_123",
      "2026-08-18T12:00:00.000Z"
    );

    expect(project).toMatchObject({
      id: "opt_123",
      title: "Immediate",
      created_at: "2026-08-18T12:00:00.000Z",
      updated_at: "2026-08-18T12:00:00.000Z",
    });
  });

  it("does not insert creates into mismatched filtered lists", () => {
    const project = optimisticProject(
      {
        client_id: "client-1",
        client_name: "Acme",
        lead_id: "lead-1",
        title: "Immediate",
      },
      "opt_123"
    );

    expect(projectMatchesList(project, { client_id: "client-1" })).toBe(true);
    expect(projectMatchesList(project, { client_id: "client-2" })).toBe(false);
    expect(projectMatchesList(project, { search: "missing" })).toBe(false);
  });

  it("keeps creates out of a different Space's list", () => {
    const project = optimisticProject(
      {
        client_id: null,
        client_name: null,
        space_id: "space-acme",
        title: "Acme work",
      },
      "opt_space"
    );

    expect(projectMatchesList(project, { space_id: "space-acme" })).toBe(true);
    expect(projectMatchesList(project, { space_id: "space-other" })).toBe(
      false
    );
    expect(project.space_id).toBe("space-acme");
  });
});
