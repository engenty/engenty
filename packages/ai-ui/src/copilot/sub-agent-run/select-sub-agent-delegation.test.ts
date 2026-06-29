import { describe, expect, it } from "vitest";
import { selectSubAgentDelegationFromMessages } from "./select-sub-agent-delegation.js";

describe("selectSubAgentDelegationFromMessages", () => {
  it("finds agent delegation by toolCallId in assistant parts", () => {
    const delegation = selectSubAgentDelegationFromMessages(
      [
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "sub-1",
              toolName: "agent-engenty_cli",
              state: "input-available",
              input: { task: "pwd" },
              progressLines: ["$ pwd"],
            },
          ],
        },
      ],
      "sub-1"
    );

    expect(delegation).toEqual(
      expect.objectContaining({
        agentId: "engenty_cli",
        agentName: "CLI Agent",
        progressLines: ["$ pwd"],
        state: "running",
        toolCallId: "sub-1",
        toolName: "agent-engenty_cli",
      })
    );
  });

  it("finds delegations persisted as tool-invocation rows by nested toolCallId", () => {
    const delegation = selectSubAgentDelegationFromMessages(
      [
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolCallId: "call_function_cvuuausam6wj_1",
              toolName: "agent-engenty_cli",
              state: "output-available",
              input: { task: "Summarize contacts" },
              output: { summary: "Done." },
              progressLines: ["Searching catalog…"],
            },
          ],
        },
      ],
      "call_function_cvuuausam6wj_1"
    );

    expect(delegation?.toolCallId).toBe("call_function_cvuuausam6wj_1");
    expect(delegation?.progressLines).toEqual(["Searching catalog…"]);
  });

  it("returns null for non-agent tools or missing ids", () => {
    expect(
      selectSubAgentDelegationFromMessages(
        [
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "dynamic-tool",
                toolCallId: "tool-1",
                toolName: "engenty_tools_search",
                state: "output-available",
              },
            ],
          },
        ],
        "tool-1"
      )
    ).toBeNull();
    expect(selectSubAgentDelegationFromMessages([], "sub-1")).toBeNull();
  });
});
