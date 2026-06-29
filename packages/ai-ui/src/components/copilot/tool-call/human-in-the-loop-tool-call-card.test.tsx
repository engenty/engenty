/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  awaitHumanAnswer,
  registerHumanInTheLoopRender,
} from "../../../copilot/human-in-the-loop-registry.js";
import { CopilotToolCallActionsProvider } from "../interrupts/copilot-tool-call-actions";
import { HumanInTheLoopToolCallCard } from "./human-in-the-loop-tool-call-card";
import type { ToolCallCardProps } from "./tool-call-card.types";

const SUSPENDED_OUTPUT = {
  call_id: "c1",
  input: { count: 3, target: "records" },
  status: "awaiting_confirmation",
  tool_name: "confirm_delete",
} as const;

describe("HumanInTheLoopToolCallCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the module card with typed args, then respond resolves + resumes", async () => {
    const cleanupRender = registerHumanInTheLoopRender("confirm_delete", {
      schema: z.object({ count: z.number(), target: z.string() }),
      render: ({ input, status, respond }) => (
        <div>
          <span>{`Delete ${(input as { count: number }).count} × ${(input as { target: string }).target}?`}</span>
          <span data-testid="status">{status}</span>
          <button onClick={() => respond({ approved: true })} type="button">
            Confirm
          </button>
        </div>
      ),
    });
    const onApprove = vi.fn();

    render(
      <CopilotToolCallActionsProvider
        awaitingInterrupt={true}
        onFrontendToolApprove={onApprove}
      >
        <HumanInTheLoopToolCallCard
          {...({
            output: SUSPENDED_OUTPUT,
            toolCallId: "c1",
            toolName: "confirm_delete",
          } as ToolCallCardProps)}
        />
      </CopilotToolCallActionsProvider>
    );

    // Typed args reach the module card; status is "executing" while suspended.
    expect(screen.getByText("Delete 3 × records?")).toBeTruthy();
    expect(screen.getByTestId("status").textContent).toBe("executing");

    fireEvent.click(screen.getByText("Confirm"));

    // respond() resolved the handler's awaited answer…
    await expect(awaitHumanAnswer("c1")).resolves.toEqual({ approved: true });
    // …and triggered the existing frontend-tool approve/resume path.
    expect(onApprove).toHaveBeenCalledTimes(1);
    // Card reflects the submitted state.
    expect(screen.getByTestId("status").textContent).toBe("submitted");

    cleanupRender();
  });

  it("renders nothing when no HITL render is registered for the tool", () => {
    render(
      <CopilotToolCallActionsProvider awaitingInterrupt={true}>
        <HumanInTheLoopToolCallCard
          {...({
            output: { ...SUSPENDED_OUTPUT, tool_name: "unregistered_tool" },
            toolCallId: "c1",
            toolName: "unregistered_tool",
          } as ToolCallCardProps)}
        />
      </CopilotToolCallActionsProvider>
    );

    expect(screen.queryByTestId("status")).toBeNull();
  });
});
