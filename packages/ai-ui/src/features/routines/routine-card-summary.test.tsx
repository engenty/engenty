/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoutineCardSummary } from "./routine-card-summary.js";
import type { RoutineDto } from "./routines-api.js";

vi.mock("@engenty/i18n/ui", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const routine: RoutineDto = {
  agent_id: "mail.assist",
  approval_grants: [],
  created_at: "2026-08-01T07:00:00.000Z",
  created_by_user_id: null,
  declaration_id: null,
  description: "Every morning: review the last 24 hours of Gmail.",
  enabled: true,
  id: "routine-1",
  last_fired_at: null,
  last_result: null,
  module_id: null,
  name: "Morning mail",
  next_due_at: null,
  outcome: null,
  outcomes: [],
  quiet_hours: null,
  report: "desk_card",
  source: "custom",
  space_id: null,
  tenant_id: "tenant-1",
  triggers: [],
  updated_at: "2026-08-01T07:00:00.000Z",
  workflow_id: "graph-1",
  workflow_input: {},
};

describe("RoutineCardSummary", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the summary, the triggers and the destinations", () => {
    render(
      <RoutineCardSummary
        routine={{
          ...routine,
          outcomes: [
            {
              config: {},
              created_at: routine.created_at,
              enabled: true,
              id: "o-1",
              mode: "always",
              provider_id: "email",
              routine_id: routine.id,
              tenant_id: routine.tenant_id,
              updated_at: routine.updated_at,
            },
          ],
          triggers: [
            {
              created_at: routine.created_at,
              cron: null,
              enabled: true,
              event_filter: null,
              id: "t-1",
              input_mapping: null,
              kind: "manual",
              next_due_at: null,
              provider_id: null,
              resource: null,
              routine_id: routine.id,
              shortcode: "mail",
              timezone: null,
              updated_at: routine.updated_at,
              webhook_secret: null,
            },
          ],
        }}
      />
    );
    expect(screen.getByText(routine.description ?? "").className).toContain(
      "line-clamp-2"
    );
    expect(screen.getByText("/mail")).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
  });

  it("falls back to the report floor and says nothing wakes it", () => {
    render(<RoutineCardSummary routine={{ ...routine, description: null }} />);
    expect(screen.getByText("routines.card.noTrigger")).toBeTruthy();
    expect(
      screen.getByText("routines.form.reportModes.desk_card")
    ).toBeTruthy();
  });
});
