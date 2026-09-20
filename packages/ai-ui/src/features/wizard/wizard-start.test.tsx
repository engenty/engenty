/**
 * @vitest-environment happy-dom
 */
import { EngentyQueryProvider } from "@engenty/query-client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GateSurfaceCardProps } from "./gate-surface-card.js";

const workflowQuery = vi.fn();
const catalogQuery = vi.fn();
const runWorkflowByAnyId = vi.fn();
const gateCard = vi.fn();

vi.mock("../workflow-canvas/workflow-queries.js", () => ({
  useWorkflowQuery: (id: string | undefined) => workflowQuery(id),
}));
vi.mock("../../lib/admin/ai-runtime-queries.js", () => ({
  useAiWorkflowsQuery: () => catalogQuery(),
}));
vi.mock("../workflow-canvas/workflow-api.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../workflow-canvas/workflow-api.js")>();
  return {
    ...actual,
    runWorkflowByAnyId: (...args: unknown[]) => runWorkflowByAnyId(...args),
  };
});
vi.mock("./gate-surface-card.js", () => ({
  GateSurfaceCard: (props: GateSurfaceCardProps) => {
    gateCard(props);
    return (
      <button
        onClick={() =>
          props.onSubmit({
            approved: true,
            data: { customer: "c-1" },
            event: "start",
          })
        }
        type="button"
      >
        start
      </button>
    );
  },
}));

const { inputSchemaIsEmpty, WizardStart } = await import("./wizard-start.js");

const STORED_ID = "6f1d2c3e-0000-4000-8000-000000000001";
const SCHEMA = {
  properties: { customer: { type: "string", "x-ref": "contacts:contact" } },
  required: ["customer"],
  type: "object",
};

function renderStart(workflowId: string, onStarted = vi.fn()) {
  render(
    <EngentyQueryProvider>
      <WizardStart
        onStarted={onStarted}
        spaceId="space-1"
        workflowId={workflowId}
      />
    </EngentyQueryProvider>
  );
  return onStarted;
}

beforeEach(() => {
  runWorkflowByAnyId.mockReset();
  gateCard.mockReset();
  runWorkflowByAnyId.mockResolvedValue({ run_id: "run-9", thread_id: "t" });
  catalogQuery.mockReturnValue({ data: undefined, isLoading: false });
  workflowQuery.mockReturnValue({ data: undefined, isLoading: false });
});
afterEach(cleanup);

describe("inputSchemaIsEmpty", () => {
  it("treats a missing or property-less schema as empty", () => {
    expect(inputSchemaIsEmpty(null)).toBe(true);
    expect(inputSchemaIsEmpty({ type: "object" })).toBe(true);
    expect(inputSchemaIsEmpty(SCHEMA)).toBe(false);
  });
});

describe("WizardStart", () => {
  it("draws the stored workflow's input schema as a form, then presses it", async () => {
    workflowQuery.mockReturnValue({
      data: {
        graph: { current_version: 2, id: STORED_ID, name: "Angebot" },
        versions: [
          { graph: { graph: [], id: "g", inputSchema: {} }, version: 1 },
          { graph: { graph: [], id: "g", inputSchema: SCHEMA }, version: 2 },
        ],
      },
      isLoading: false,
    });
    const onStarted = renderStart(STORED_ID);
    const surface = gateCard.mock.calls[0]?.[0].gate.surface;
    expect(surface.components.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("start"));
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
    expect(runWorkflowByAnyId).toHaveBeenCalledWith(STORED_ID, {
      input: { customer: "c-1" },
      space_id: "space-1",
    });
    expect(onStarted).toHaveBeenCalledWith({ run_id: "run-9", thread_id: "t" });
  });

  it("reads a module workflow's schema from the catalog", () => {
    catalogQuery.mockReturnValue({
      data: {
        workflows: [
          { id: "offers.create", input_schema_json: SCHEMA, name: "Angebot" },
        ],
      },
      isLoading: false,
    });
    renderStart("offers.create");
    expect(gateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        gate: expect.objectContaining({ title: "Angebot" }),
      })
    );
  });

  it("starts at once when the schema asks for nothing", async () => {
    catalogQuery.mockReturnValue({
      data: {
        workflows: [
          { id: "offers.create", input_schema_json: null, name: "Angebot" },
        ],
      },
      isLoading: false,
    });
    const onStarted = renderStart("offers.create");
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
    expect(runWorkflowByAnyId).toHaveBeenCalledTimes(1);
    expect(runWorkflowByAnyId).toHaveBeenCalledWith("offers.create", {
      input: {},
      space_id: "space-1",
    });
    expect(gateCard).not.toHaveBeenCalled();
  });
});
