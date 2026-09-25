/**
 * @vitest-environment happy-dom
 */
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyEngentyAgUiConversationAction,
  type EngentyAgUiConversationState,
  type EngentyAgUiMessage,
} from "../../../ag-ui/conversation.js";
import { agUiMessagesToCopilotMessages } from "../../../ag-ui/copilot-adapter.js";
import { CopilotTranscript } from "./copilot-transcript.js";

// Which rows drew their content, in order.
const drawnRows: string[] = [];

vi.mock("./copilot-message-content", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./copilot-message-content.js")>();
  return {
    ...actual,
    CopilotMessageContent: (props: { msg: { id: string } }) => {
      drawnRows.push(props.msg.id);
      return null;
    },
  };
});

vi.mock("../../../threads/thread-memory-observations.js", async (orig) => ({
  ...(await orig<object>()),
  useThreadMemoryObservationsQuery: () => ({ data: undefined }),
}));

vi.mock("../../../lib/admin/ai-runtime-queries.js", async (orig) => ({
  ...(await orig<object>()),
  useAiAgentsQuery: () => ({ data: undefined }),
}));

function conversationOf(turns: number): EngentyAgUiConversationState {
  const messages: EngentyAgUiMessage[] = [];
  for (let turn = 0; turn < turns; turn++) {
    messages.push({
      content: `question ${turn}`,
      id: `u${turn}`,
      role: "user",
    });
    messages.push({
      content: `answer ${turn}`,
      id: `a${turn}`,
      role: "assistant",
    } as EngentyAgUiMessage);
  }
  return {
    activeTextMessageId: `a${turns - 1}`,
    events: [],
    messages,
    state: {},
    status: "running",
  };
}

function streamToken(
  conversation: EngentyAgUiConversationState,
  messageId: string
): EngentyAgUiConversationState {
  return applyEngentyAgUiConversationAction(conversation, {
    event: { delta: " more", messageId, type: "TEXT_MESSAGE_CONTENT" },
    type: "event",
  } as Parameters<typeof applyEngentyAgUiConversationAction>[1]);
}

function transcript(
  conversation: EngentyAgUiConversationState,
  extra: { containerClassName?: string } = {}
) {
  return (
    <MemoryRouter>
      <CopilotTranscript
        containerClassName={extra.containerClassName}
        messages={agUiMessagesToCopilotMessages(conversation.messages)}
        status="streaming"
        subAgentSectionLabels={{ input: "In", log: "Log", output: "Out" }}
        surface="chat"
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  drawnRows.length = 0;
});

afterEach(cleanup);

describe("CopilotTranscript redraws", () => {
  it("a streaming token redraws only the row it lands in", () => {
    const before = conversationOf(20);
    const view = render(transcript(before));
    expect(drawnRows).toHaveLength(40);
    drawnRows.length = 0;

    view.rerender(transcript(streamToken(before, "a19")));

    expect(drawnRows).toEqual(["a19"]);
  });

  it("a host render with the same transcript (a composer keystroke) redraws no row", () => {
    const conversation = conversationOf(5);
    const messages = agUiMessagesToCopilotMessages(conversation.messages);
    const view = render(
      <MemoryRouter>
        <CopilotTranscript
          containerClassName="lane"
          messages={messages}
          status="ready"
          subAgentSectionLabels={{ input: "In", log: "Log", output: "Out" }}
        />
      </MemoryRouter>
    );
    drawnRows.length = 0;

    view.rerender(
      <MemoryRouter>
        <CopilotTranscript
          containerClassName="lane"
          messages={messages}
          status="ready"
          subAgentSectionLabels={{ input: "In", log: "Log", output: "Out" }}
        />
      </MemoryRouter>
    );

    expect(drawnRows).toEqual([]);
  });
});
