/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptInputSubmit } from "./prompt-input.js";

afterEach(() => {
  cleanup();
});

describe("PromptInputSubmit stop mode", () => {
  it("shows a spinner by default while streaming with onStop", () => {
    render(
      <PromptInputSubmit onStop={vi.fn()} status="streaming" variant="ghost" />
    );

    const button = screen.getByRole("button", { name: "Stop generation" });
    expect(button.className).toContain("group/prompt-stop");
    expect(button.querySelector('[role="status"]')).toBeTruthy();
  });

  it("calls onStop when clicked during streaming", async () => {
    const onStop = vi.fn();
    render(<PromptInputSubmit onStop={onStop} status="streaming" />);

    screen.getByRole("button", { name: "Stop generation" }).click();
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
