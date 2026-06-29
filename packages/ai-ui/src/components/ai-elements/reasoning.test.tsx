/** @vitest-environment happy-dom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./reasoning.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Reasoning", () => {
  it("shows streaming thinking text while open", () => {
    render(
      <Reasoning isStreaming>
        <ReasoningTrigger />
        <ReasoningContent>
          Let me think about this step by step.
        </ReasoningContent>
      </Reasoning>
    );

    expect(screen.getByText("Thinking")).toBeTruthy();
    expect(
      screen.getByText("Let me think about this step by step.")
    ).toBeTruthy();
  });

  it("auto-collapses after streaming finishes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const { rerender } = render(
      <Reasoning isStreaming>
        <ReasoningTrigger />
        <ReasoningContent>Working through the plan.</ReasoningContent>
      </Reasoning>
    );

    expect(screen.getByText("Working through the plan.")).toBeTruthy();

    vi.setSystemTime(new Date("2026-01-01T00:00:43Z"));
    rerender(
      <Reasoning isStreaming={false}>
        <ReasoningTrigger />
        <ReasoningContent>Working through the plan.</ReasoningContent>
      </Reasoning>
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByText("Working through the plan.")).toBeNull();
    expect(screen.getByText("Thought for 43s")).toBeTruthy();
  });
});
