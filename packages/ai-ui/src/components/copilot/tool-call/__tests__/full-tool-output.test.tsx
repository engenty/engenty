/** @vitest-environment happy-dom */
import { EngentyQueryProvider } from "@engenty/query-client";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EngentyAIContext } from "../../../../agent-provider/engenty-ai-provider.js";
import { FullToolOutput } from "../full-tool-output.js";

// Ways this can fail: an opened slimmed step keeps showing the placeholder
// (full row never fetched, or the wrong part picked out of it); an ordinary
// result starts fetching, or needs a query client it never used before.

vi.mock("../../../../ag-ui/apps-ai/apps-ai-api.js", () => ({
  appsAiRequestHeaders: vi.fn(async () => ({})),
  appsAiThreadsPath: (base: string) => `${base}/ai/threads`,
  withAppsAiSearchParams: (href: string) => href,
}));

const threadId = "00000000-0000-4000-8000-0000000000aa";
const messageId = "00000000-0000-4000-8000-0000000000bb";

function Show({ output }: { output: unknown }) {
  return <pre data-testid="out">{JSON.stringify(output)}</pre>;
}

describe("FullToolOutput", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("swaps a slim placeholder for the full result of that tool call", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          message: {
            id: messageId,
            parts: [
              {
                toolInvocation: {
                  result: { other: true },
                  toolCallId: "call-other",
                },
                type: "tool-invocation",
              },
              {
                toolInvocation: {
                  result: { rows: ["the", "full", "listing"] },
                  toolCallId: "call-1",
                },
                type: "tool-invocation",
              },
            ],
            thread_id: threadId,
          },
        }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <EngentyQueryProvider>
        <EngentyAIContext.Provider
          value={{ serviceBaseUrl: "http://ai.test" } as never}
        >
          <FullToolOutput
            output={{
              _slim: true,
              bytes: 9000,
              message_id: messageId,
              thread_id: threadId,
            }}
            toolCallId="call-1"
          >
            {(output) => <Show output={output} />}
          </FullToolOutput>
        </EngentyAIContext.Provider>
      </EngentyQueryProvider>
    );
    expect(
      await screen.findByText('{"rows":["the","full","listing"]}')
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      `http://ai.test/ai/threads/${threadId}/messages/${messageId}`,
      expect.anything()
    );
  });

  it("renders an ordinary result as is, without a query client", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <FullToolOutput output={{ ok: true }} toolCallId="call-1">
        {(output) => <Show output={output} />}
      </FullToolOutput>
    );
    expect(screen.getByTestId("out").textContent).toBe('{"ok":true}');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
