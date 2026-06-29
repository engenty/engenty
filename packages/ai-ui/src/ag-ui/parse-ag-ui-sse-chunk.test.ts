import { parseAgUiSseChunk } from "@engenty/ag-ui-bridge";
import { describe, expect, it } from "vitest";

describe("parseAgUiSseChunk", () => {
  it("parses AG-UI SSE data blocks", () => {
    expect(
      parseAgUiSseChunk(
        [
          'data: {"type":"RUN_STARTED","runId":"run-1","threadId":"thread-1"}',
          "",
          'data: {"type":"CUSTOM","name":"engenty.context.loaded","value":{}}',
          "",
        ].join("\n")
      )
    ).toEqual([
      { runId: "run-1", threadId: "thread-1", type: "RUN_STARTED" },
      { name: "engenty.context.loaded", type: "CUSTOM", value: {} },
    ]);
  });

  it("ignores invalid AG-UI event payloads", () => {
    expect(
      parseAgUiSseChunk(
        [
          'data: {"type":"RUN_STARTED","runId":"run-1","threadId":"thread-1"}',
          "",
          'data: {"type":"NOT_AG_UI","runId":"run-1"}',
          "",
          "data: not-json",
          "",
        ].join("\n")
      )
    ).toEqual([{ runId: "run-1", threadId: "thread-1", type: "RUN_STARTED" }]);
  });
});
