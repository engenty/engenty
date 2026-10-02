/**
 * @vitest-environment happy-dom
 */
import { EngentyQueryProvider } from "@engenty/query-client";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AgentMessageToolCallCard } from "../agent-message-tool-call-card.js";

type CardProps = Parameters<typeof AgentMessageToolCallCard>[0];

function renderCard(props: Partial<CardProps>) {
  return render(
    <EngentyQueryProvider>
      <MemoryRouter>
        <AgentMessageToolCallCard {...(props as CardProps)} />
      </MemoryRouter>
    </EngentyQueryProvider>
  );
}

describe("AgentMessageToolCallCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows only the newest progress line while the hand-off runs", () => {
    const { rerender } = renderCard({
      input: { agent_id: "tim", message: "Your turn." },
      progressLines: ["Running web_search", "Running artifact_read"],
      state: "running",
    });

    // In words, never the tool id.
    expect(screen.getByTestId("agent-message-progress").textContent).toBe(
      "agentDesk.activity.now.reading"
    );

    rerender(
      <EngentyQueryProvider>
        <MemoryRouter>
          <AgentMessageToolCallCard
            input={{ agent_id: "tim", message: "Your turn." }}
            output={{ agent: "Tim", agent_id: "tim", ok: true, result: "x→5" }}
            progressLines={["Running artifact_read"]}
            state="completed"
            toolName="message_agent"
          />
        </MemoryRouter>
      </EngentyQueryProvider>
    );

    expect(screen.queryByTestId("agent-message-progress")).toBeNull();
  });

  it("names every room member instead of the room host", () => {
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
    expect(row.textContent).toContain("Tim");
    expect(row.textContent).toContain("Tom");
    expect(row.textContent).not.toContain("chief");
  });
});
