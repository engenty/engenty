/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GateDecision } from "./gate-surface-card.js";

// The surface renderer is the catalog's; this card owns what a submit MEANS.
// A stand-in surface exposes the props the card hands down and two buttons
// that submit the way a Form's actions would.
const seen = vi.fn();
vi.mock("@engenty/a2ui-catalog", () => ({
  buildEngentyA2uiMessages: (params: {
    components: unknown[];
    data?: Record<string, unknown>;
    surfaceId: string;
  }) => ({
    messages: [{ createSurface: { surfaceId: params.surfaceId } }],
    surfaceId: params.surfaceId,
  }),
  EngentyA2uiSurfaceView: (props: {
    initialData?: Record<string, unknown>;
    onSubmit?: (event: string, data: Record<string, unknown>) => void;
    readOnly?: boolean;
  }) => {
    seen(props);
    const data = { ...(props.initialData ?? {}), name: "Acme" };
    return (
      <div>
        <button
          disabled={props.readOnly}
          onClick={() => props.onSubmit?.("next", data)}
          type="button"
        >
          Weiter
        </button>
        <button
          onClick={() => props.onSubmit?.("reject", { reason: "Nope" })}
          type="button"
        >
          Ablehnen
        </button>
      </div>
    );
  },
}));
vi.mock("../../a2ui/engenty-a2ui-host.js", () => ({
  EngentyA2uiHostBoundary: ({ children }: { children: React.ReactNode }) =>
    children,
}));

const { GateSurfaceCard, gateDecisionFromSubmit } = await import(
  "./gate-surface-card.js"
);

afterEach(() => {
  cleanup();
  seen.mockClear();
});

const gate = {
  accepts_text: false,
  kind: "surface" as const,
  path: ["ask"],
  stepId: "ask",
  surface: {
    components: [{ component: "TextField", id: "n", value: { path: "/name" } }],
    data: { name: "", scope: "default" },
  },
  title: "Für wen?",
};

describe("GateSurfaceCard", () => {
  it("resumes with the submit event and the data model", () => {
    const onSubmit = vi.fn<(decision: GateDecision) => void>();
    render(<GateSurfaceCard gate={gate} onSubmit={onSubmit} />);
    expect(screen.getByText("Für wen?")).toBeTruthy();
    fireEvent.click(screen.getByText("Weiter"));
    expect(onSubmit).toHaveBeenCalledWith({
      approved: true,
      data: { name: "Acme" },
      event: "next",
    });
  });

  it("reads a reject event as a refusal, with the reason typed", () => {
    const onSubmit = vi.fn<(decision: GateDecision) => void>();
    render(<GateSurfaceCard gate={gate} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("Ablehnen"));
    expect(onSubmit).toHaveBeenCalledWith({
      approved: false,
      data: { reason: "Nope" },
      event: "reject",
      reason: "Nope",
    });
  });

  it("prefills from the previous answer over the surface defaults", () => {
    render(
      <GateSurfaceCard
        answer={{ approved: true, data: { name: "Globex" }, event: "next" }}
        gate={gate}
        onSubmit={vi.fn()}
      />
    );
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({
        initialData: { name: "Globex", scope: "default" },
      })
    );
  });

  it("shows back and cancel only when the host handles them", () => {
    const { rerender } = render(
      <GateSurfaceCard gate={gate} onSubmit={vi.fn()} />
    );
    expect(screen.queryByText("gateSurface.back")).toBeNull();
    const onBack = vi.fn();
    rerender(
      <GateSurfaceCard
        gate={gate}
        onBack={onBack}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("gateSurface.back"));
    expect(onBack).toHaveBeenCalled();
    expect(screen.getByText("gateSurface.cancel")).toBeTruthy();
  });

  it("disables the surface while busy and swallows a submit", () => {
    const onSubmit = vi.fn();
    render(<GateSurfaceCard busy gate={gate} onSubmit={onSubmit} />);
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({ readOnly: true })
    );
    fireEvent.click(screen.getByText("Ablehnen"));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("gateDecisionFromSubmit", () => {
  it("drops a blank reason", () => {
    expect(gateDecisionFromSubmit("approve", { reason: "  " })).toEqual({
      approved: true,
      data: { reason: "  " },
      event: "approve",
    });
  });
});
