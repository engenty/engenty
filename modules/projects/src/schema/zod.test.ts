import { describe, expect, it } from "vitest";
import {
  phaseTaskInputSchema,
  projectCreateInputSchema,
  projectInputSchema,
  projectPhaseInputSchema,
  projectsListQuerySchema,
  projectUpdateSchema,
  taskStatusSchema,
} from "./zod.js";

describe("projects schema", () => {
  describe("projectCreateInputSchema", () => {
    it("accepts modal payload without portal/lead/created_by", () => {
      const fromModal = projectCreateInputSchema.safeParse({
        title: "Test 01",
        client_id: null,
        start_date: null,
        end_date: null,
        briefing: null,
      });
      expect(fromModal.success).toBe(true);

      const withDates = projectCreateInputSchema.safeParse({
        title: "Test",
        client_id: null,
        start_date: "2025-01-01",
        end_date: "2025-12-31",
        briefing: "Brief",
      });
      expect(withDates.success).toBe(true);
    });

    it("accepts optional portal/lead/created_by when provided", () => {
      const full = projectCreateInputSchema.safeParse({
        title: "Project",
        client_id: "550e8400-e29b-41d4-a716-446655440000",
        lead_id: "550e8400-e29b-41d4-a716-446655440001",
        portal_enabled: true,
        portal_password: "secret",
        portal_intro_text: "Intro",
        created_by: "550e8400-e29b-41d4-a716-446655440002",
        start_date: null,
        end_date: null,
        briefing: null,
      });
      expect(full.success).toBe(true);
    });

    it("rejects empty or missing title", () => {
      expect(
        projectCreateInputSchema.safeParse({ title: "", client_id: null })
          .success
      ).toBe(false);
      expect(
        projectCreateInputSchema.safeParse({ client_id: null }).success
      ).toBe(false);
    });

    it("rejects invalid UUID when lead_id or created_by provided", () => {
      expect(
        projectCreateInputSchema.safeParse({
          title: "Project",
          client_id: null,
          lead_id: "not-a-uuid",
        }).success
      ).toBe(false);
      expect(
        projectCreateInputSchema.safeParse({
          title: "Project",
          client_id: null,
          created_by: "invalid",
        }).success
      ).toBe(false);
    });

    it("rejects invalid portal_enabled type", () => {
      expect(
        projectCreateInputSchema.safeParse({
          title: "Project",
          client_id: null,
          portal_enabled: "yes",
        }).success
      ).toBe(false);
    });

    it("accepts optional team_member_ids", () => {
      const parsed = projectCreateInputSchema.safeParse({
        title: "Project",
        client_id: null,
        start_date: null,
        end_date: null,
        briefing: null,
        team_member_ids: [
          "550e8400-e29b-41d4-a716-446655440099",
          "660e8400-e29b-41d4-a716-446655440088",
        ],
      });
      expect(parsed.success).toBe(true);
    });
  });

  it("validates project input", () => {
    const valid = projectInputSchema.safeParse({
      client_id: "client-1",
      client_name: null,
      lead_id: null,
      title: "My Project",
      briefing: null,
      start_date: null,
      end_date: null,
      portal_enabled: false,
      portal_password: null,
      portal_intro_text: null,
      created_by: null,
    });
    expect(valid.success).toBe(true);

    const missingTitle = projectInputSchema.safeParse({
      client_id: "client-1",
      title: "",
    });
    expect(missingTitle.success).toBe(false);
  });

  it("accepts partial project update", () => {
    const parsed = projectUpdateSchema.safeParse({
      title: "Updated Project",
      end_date: "2025-12-31",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts team_member_ids on project update", () => {
    const parsed = projectUpdateSchema.safeParse({
      team_member_ids: ["550e8400-e29b-41d4-a716-446655440099"],
    });
    expect(parsed.success).toBe(true);
  });

  it("validates phase input", () => {
    const valid = projectPhaseInputSchema.safeParse({
      project_id: "proj-1",
      title: "Phase 1",
      start_date: null,
      end_date: null,
      is_main: false,
      is_public: false,
      order_index: 0,
    });
    expect(valid.success).toBe(true);
  });

  it("validates task input", () => {
    const valid = phaseTaskInputSchema.safeParse({
      project_id: "proj-1",
      phase_id: "phase-1",
      title: "Task 1",
      content: null,
      discipline: null,
      hours: null,
      status: "todo",
      is_public: false,
      order_index: 0,
    });
    expect(valid.success).toBe(true);
  });

  it("validates list query params", () => {
    const valid = projectsListQuerySchema.safeParse({
      page: 1,
      pageSize: 25,
      sortBy: "title",
      sortOrder: "asc",
      search: "test",
    });
    expect(valid.success).toBe(true);

    const empty = projectsListQuerySchema.safeParse({});
    expect(empty.success).toBe(true);
  });

  it("validates task status slug", () => {
    expect(taskStatusSchema.safeParse("todo").success).toBe(true);
    expect(taskStatusSchema.safeParse("in_progress").success).toBe(true);
    expect(taskStatusSchema.safeParse("in_review").success).toBe(true);
    expect(taskStatusSchema.safeParse("").success).toBe(false);
    expect(taskStatusSchema.safeParse("Bad").success).toBe(false);
    expect(taskStatusSchema.safeParse("9bad").success).toBe(false);
  });
});
