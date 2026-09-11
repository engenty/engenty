/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentNamePill } from "./agent-name-pill.js";

describe("AgentNamePill", () => {
  it("wraps the name in a capsule with the Engenty inside", () => {
    const { container } = render(
      <AgentNamePill kind="drop" name="Knowledge Base Manager" />
    );

    const pill = screen.getByText("Knowledge Base Manager").parentElement;
    expect(pill?.className).toContain("rounded-full");
    expect(pill?.className).toContain("bg-primary/15");
    expect(pill?.className).toContain("gap-px");
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
