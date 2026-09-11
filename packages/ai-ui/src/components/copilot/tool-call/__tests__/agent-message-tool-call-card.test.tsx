/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AgentMessageToolCallCard } from "../agent-message-tool-call-card.js";

type CardProps = Parameters<typeof AgentMessageToolCallCard>[0];

function renderCard(props: Partial<CardProps>) {
  return render(
    <MemoryRouter>
      <AgentMessageToolCallCard {...(props as CardProps)} />
    </MemoryRouter>
  );
}

describe("AgentMessageToolCallCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows what the colleague is doing while the hand-off is in flight", () => {
    renderCard({
      input: { agent_id: "tim", message: "Your turn." },
      progressLines: ["Running table_read", "Running table_write"],
      state: "running",
    });

    expect(screen.getByTestId("agent-message-progress").textContent).toBe(
      "Running table_write"
    );
  });

  it("keeps the finished hand-off a single line", () => {
    renderCard({
      input: { agent_id: "tim", message: "Your turn." },
      output: { agent: "Tim", agent_id: "tim", ok: true, result: "x→5" },
      progressLines: ["Running table_write"],
      state: "completed",
    });

    expect(screen.queryByTestId("agent-message-progress")).toBeNull();
  });

  it("a room post names every member and says the room was opened", () => {
    renderCard({
      input: { agent_ids: ["tim", "tom"], message: "Let's play." },
      output: {
        agent_id: "chief",
        child_thread_id: "room-1",
        members: [
          { agent_id: "tim", engenty: "round", name: "Tim" },
          { agent_id: "tom", engenty: "round", name: "Tom" },
        ],
        mode: "room",
        ok: true,
        opened: true,
        room_host_agent_id: "chief",
      },
      state: "completed",
    });

    const row = screen.getByTestId("agent-message-row");
    expect(row.textContent).toContain("agentMessage.openedRoom");
    expect(row.textContent).toContain("Tim");
    expect(row.textContent).toContain("Tom");
    expect(row.textContent).not.toContain("chief");
  });
});
