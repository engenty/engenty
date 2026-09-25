/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GateSurfaceCardProps } from "./gate-surface-card.js";

const wizardRun = vi.fn();
const resumeMutate = vi.fn();
const travelMutate = vi.fn();
const cancelMutate = vi.fn();
const gateCard = vi.fn();
const pane = vi.fn();
const openObjectPaneTab = vi.fn();

vi.mock("./use-wizard-run.js", () => ({
  useWizardRun: (runId: string) => wizardRun(runId),
}));
vi.mock("../workflow-canvas/workflow-queries.js", () => ({
  useCancelRunMutation: () => ({
    error: null,
    isPending: false,
    mutate: cancelMutate,
  }),
  useResumeRunMutation: () => ({
    error: null,
    isPending: false,
    mutate: resumeMutate,
  }),
  useTimeTravelRunMutation: () => ({
    error: null,
    isPending: false,
    mutate: travelMutate,
  }),
}));
vi.mock("./gate-surface-card.js", () => ({
  GateSurfaceCard: (props: GateSurfaceCardProps) => {
    gateCard(props);
    return (
      <div data-testid="gate">
        <span>{props.gate.title}</span>
        <button
          onClick={() =>
            props.onSubmit({ approved: true, data: { ok: 1 }, event: "next" })
          }
          type="button"
        >
          submit
        </button>
        {props.onBack ? (
          <button onClick={props.onBack} type="button">
            back
          </button>
        ) : null}
        {props.onCancel ? (
          <button onClick={props.onCancel} type="button">
            cancel
          </button>
        ) : null}
      </div>
    );
  },
}));
vi.mock("../../artifacts/artifact-store.js", () => ({
  openObjectPaneTab: (...args: unknown[]) => openObjectPaneTab(...args),
}));
vi.mock("../../artifacts/workspace-artifact-pane.js", () => ({
  WorkspaceArtifactPane: (props: Record<string, unknown>) => {
    pane(props);
    return null;
  },
}));
vi.mock("../agents-workspace/workflow-run-status.js", () => ({
  WorkflowRunStatus: ({ status }: { status: { text: string } }) => (
    <div data-testid="run-status">{status.text}</div>
  ),
}));

const { clearObjectWidgetsForTests, registerObjectWidget } = await import(
  "../../objects/object-widget-registry.js"
);
const { WizardRunner, wizardRunState } = await import("./wizard-runner.js");

const OFFER_DETAIL = /^\/mdl\/offers\/([\w-]+)$/;

function registerOfferWidget() {
  registerObjectWidget({
    card: () => null,
    entity: "offer",
    getHref: (ref) => `/mdl/offers/${ref.id}`,
    id: "offers.offer",
    matchHref: (pathname) => {
      const match = pathname.match(OFFER_DETAIL);
      return match ? { entity: "offer", id: match[1], module: "offers" } : null;
    },
    module: "offers",
  });
}

const GRAPH = {
  graph: [
    { id: "prep-ask", type: "mapping", mapConfig: "{}" },
    { id: "ask", toolId: "approval_gate", type: "tool" },
    {
      loopType: "dountil",
      step: {
        id: "draft-loop",
        steps: [
          { id: "prep-review", type: "mapping", mapConfig: "{}" },
          { id: "review", toolId: "approval_gate", type: "tool" },
        ],
        type: "workflow",
      },
      type: "loop",
    },
  ],
  id: "wf",
};

function gateAt(stepId: string, path: string[]) {
  return {
    accepts_text: false,
    kind: "surface" as const,
    path,
    stepId,
    surface: { components: [], data: { a: 1 } },
    title: `Step ${stepId}`,
  };
}

function runData(input: {
  answers?: Record<string, unknown>;
  gate?: ReturnType<typeof gateAt>;
  nodes?: Record<string, { state: string }>;
  request?: Record<string, unknown>;
  snapshot?: null;
  status?: string;
}) {
  return {
    request: {
      context_id: null,
      context_type: null,
      created_at: "",
      id: "req",
      reason: null,
      run_id: "run-1",
      status: "dispatched",
      thread_id: "thread-1",
      updated_at: "",
      ...(input.request ?? {}),
    },
    snapshot:
      input.snapshot === null
        ? null
        : {
            answers: input.answers,
            gate: input.gate,
            nodes: input.nodes ?? {},
            status: input.status ?? "running",
          },
    version: { graph: GRAPH, version: 1 },
  };
}

function mockRun(data: ReturnType<typeof runData> | undefined, stream = null) {
  const refetch = vi.fn();
  const reattach = vi.fn();
  wizardRun.mockReturnValue({
    query: { data, isLoading: false, refetch },
    reattach,
    refetch,
    stream,
  });
  return { reattach, refetch };
}

beforeEach(() => {
  resumeMutate.mockReset();
  travelMutate.mockReset();
  cancelMutate.mockReset();
  gateCard.mockReset();
  pane.mockReset();
  openObjectPaneTab.mockReset();
  clearObjectWidgetsForTests();
});
afterEach(cleanup);

describe("wizardRunState", () => {
  it("names each state from the row and the snapshot", () => {
    const req = (status: string) =>
      ({ status }) as Parameters<typeof wizardRunState>[0];
    const snap = (status: string, gate?: unknown) =>
      ({ gate, nodes: {}, status }) as Parameters<typeof wizardRunState>[1];
    expect(wizardRunState(req("dispatched"), null)).toBe("starting");
    expect(wizardRunState(req("cancelled"), snap("suspended"))).toBe(
      "cancelled"
    );
    expect(wizardRunState(req("requires_action"), snap("suspended", {}))).toBe(
      "gate"
    );
    expect(wizardRunState(req("dispatched"), snap("running"))).toBe("running");
    expect(wizardRunState(req("sleeping"), snap("waiting"))).toBe("sleeping");
    expect(wizardRunState(req("completed"), snap("success"))).toBe("completed");
    expect(wizardRunState(req("failed"), snap("failed"))).toBe("failed");
  });
});

describe("WizardRunner", () => {
  it("says a run it cannot load is unavailable and lets the person leave", () => {
    const onExit = vi.fn();
    wizardRun.mockReturnValue({
      query: {
        data: undefined,
        isError: true,
        isLoading: false,
        refetch: vi.fn(),
      },
      reattach: vi.fn(),
      refetch: vi.fn(),
      stream: null,
    });
    render(
      <MemoryRouter>
        <WizardRunner onExit={onExit} runId="missing" />
      </MemoryRouter>
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("shows the gate and resumes with the full step path", () => {
    const { reattach } = mockRun(
      runData({
        gate: gateAt("review", ["draft-loop", "review"]),
        status: "suspended",
      })
    );
    render(<WizardRunner runId="run-1" />);
    expect(screen.getByText("Step review")).toBeTruthy();
    fireEvent.click(screen.getByText("submit"));
    expect(resumeMutate).toHaveBeenCalledWith(
      {
        approved: true,
        data: { ok: 1 },
        event: "next",
        runId: "run-1",
        step_id: "review",
        step_path: ["draft-loop", "review"],
      },
      expect.anything()
    );
    // The stream ended on suspend; a resume must re-attach.
    resumeMutate.mock.calls[0]?.[1].onSuccess();
    expect(reattach).toHaveBeenCalled();
  });

  it("travels back to the previous gate and keeps its answer as prefill", () => {
    mockRun(
      runData({
        answers: { ask: { approved: true, data: { name: "Acme" } } },
        gate: gateAt("review", ["draft-loop", "review"]),
        status: "suspended",
      })
    );
    const { rerender } = render(<WizardRunner runId="run-1" />);
    fireEvent.click(screen.getByText("back"));
    expect(travelMutate).toHaveBeenCalledWith(
      { runId: "run-1", step_path: ["ask"] },
      expect.anything()
    );
    // The run moves for a moment before the gate re-suspends…
    mockRun(runData({ answers: {}, status: "running" }));
    rerender(<WizardRunner runId="run-1" />);
    // …and the snapshot after travel no longer carries `ask`'s answer.
    mockRun(
      runData({
        answers: {},
        gate: gateAt("ask", ["ask"]),
        status: "suspended",
      })
    );
    rerender(<WizardRunner runId="run-1" />);
    expect(gateCard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        answer: { approved: true, data: { name: "Acme" } },
      })
    );
  });

  it("offers no back on the first gate", () => {
    mockRun(runData({ gate: gateAt("ask", ["ask"]), status: "suspended" }));
    render(<WizardRunner runId="run-1" />);
    expect(screen.queryByText("back")).toBeNull();
  });

  it("cancels through the cancel route", () => {
    mockRun(runData({ gate: gateAt("ask", ["ask"]), status: "suspended" }));
    render(<WizardRunner runId="run-1" />);
    fireEvent.click(screen.getByText("cancel"));
    expect(cancelMutate).toHaveBeenCalledWith("run-1", expect.anything());
  });

  it("narrates the running step from the stream", () => {
    mockRun(runData({ status: "running" }), {
      artifactId: null,
      error: null,
      phase: "running",
      steps: [],
      suggestions: [],
      text: "Drafting…",
    } as never);
    render(<WizardRunner runId="run-1" />);
    expect(screen.getByTestId("run-status").textContent).toBe("Drafting…");
  });

  it("shows the wake time while asleep", () => {
    mockRun(
      runData({
        request: { wake_at: "2026-09-21T08:00:00.000Z" },
        status: "waiting",
      })
    );
    render(<WizardRunner runId="run-1" />);
    expect(screen.getByText(/wizard\.state\.sleeping/)).toBeTruthy();
  });

  it("shows the summary and Done once finished", () => {
    mockRun(
      runData({
        request: { status: "completed", summary: "Offer sent." },
        status: "success",
      })
    );
    const onExit = vi.fn();
    render(<WizardRunner onExit={onExit} runId="run-1" />);
    expect(screen.getByText("Offer sent.")).toBeTruthy();
    fireEvent.click(screen.getByText("wizard.done"));
    expect(onExit).toHaveBeenCalled();
  });

  it("opens the record the closing line links in the run's pane", () => {
    registerOfferWidget();
    mockRun(
      runData({
        request: {
          status: "completed",
          summary:
            "Angebot ang-2026-1003 ist angelegt.\n\n[Angebot öffnen](/mdl/offers/offer-7)",
        },
        status: "success",
      })
    );
    const { rerender } = render(
      <MemoryRouter>
        <WizardRunner artifactPaneHostKey="wizard:run-1" runId="run-1" />
      </MemoryRouter>
    );
    expect(openObjectPaneTab).toHaveBeenCalledWith(
      "wizard:run-1",
      { entity: "offer", id: "offer-7", module: "offers" },
      { title: "Angebot öffnen" }
    );

    // Once per record: a re-render must not reopen a pane the person closed.
    rerender(
      <MemoryRouter>
        <WizardRunner artifactPaneHostKey="wizard:run-1" runId="run-1" />
      </MemoryRouter>
    );
    expect(openObjectPaneTab).toHaveBeenCalledTimes(1);
  });

  it("reads the record back from a link minted inside a space", () => {
    registerOfferWidget();
    mockRun(
      runData({
        request: {
          status: "completed",
          summary:
            "Das Angebot ist angelegt.\n\n[ang-2026-1004](/s/engrd/offers/offer-7)",
        },
        status: "success",
      })
    );
    render(
      <MemoryRouter>
        <WizardRunner artifactPaneHostKey="wizard:run-1" runId="run-1" />
      </MemoryRouter>
    );
    expect(openObjectPaneTab).toHaveBeenCalledWith(
      "wizard:run-1",
      { entity: "offer", id: "offer-7", module: "offers" },
      { title: "ang-2026-1004" }
    );
  });

  it("leaves the pane alone while the run is still going", () => {
    registerOfferWidget();
    mockRun(
      runData({
        gate: gateAt("ask", ["ask"]),
        request: { summary: "[Angebot öffnen](/mdl/offers/offer-7)" },
        status: "suspended",
      })
    );
    render(<WizardRunner artifactPaneHostKey="wizard:run-1" runId="run-1" />);
    expect(openObjectPaneTab).not.toHaveBeenCalled();
  });

  it("offers a restart with the reason after a failure or a cancel", () => {
    mockRun(
      runData({
        request: { reason: "boom", status: "failed" },
        status: "failed",
      })
    );
    const onRestart = vi.fn();
    const { unmount } = render(
      <WizardRunner onRestart={onRestart} runId="run-1" />
    );
    expect(screen.getByText("boom")).toBeTruthy();
    fireEvent.click(screen.getByText("wizard.restart"));
    expect(onRestart).toHaveBeenCalled();
    unmount();

    mockRun(runData({ request: { status: "cancelled" }, status: "suspended" }));
    render(<WizardRunner onRestart={onRestart} runId="run-1" />);
    expect(screen.getByText("wizard.state.cancelled")).toBeTruthy();
  });

  it("says it is starting before the first snapshot exists", () => {
    mockRun(runData({ snapshot: null }));
    render(<WizardRunner runId="run-1" />);
    expect(screen.getByText("wizard.state.starting")).toBeTruthy();
  });

  it("mounts the run's artifact pane, opening on the first artifact", () => {
    mockRun(runData({ gate: gateAt("ask", ["ask"]), status: "suspended" }));
    render(<WizardRunner artifactPaneHostKey="wizard:run-1" runId="run-1" />);
    expect(pane).toHaveBeenCalledWith(
      expect.objectContaining({
        hostKey: "wizard:run-1",
        openOnFirstArtifact: true,
        scope: { id: "thread-1", type: "thread" },
      })
    );
  });
});
