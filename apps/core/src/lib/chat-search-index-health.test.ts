import { describe, expect, it } from "vitest";
import { evaluateChatSearchIndexHealth } from "./chat-search-index-health.js";

describe("evaluateChatSearchIndexHealth", () => {
  it("returns ok when there are no sessions", () => {
    expect(
      evaluateChatSearchIndexHealth({
        document_count: 0,
        missing_session_count: 0,
        total_sessions: 0,
      })
    ).toEqual({ level: "ok", ok: true });
  });

  it("returns missing when sessions exist but nothing is indexed", () => {
    expect(
      evaluateChatSearchIndexHealth({
        document_count: 0,
        missing_session_count: 5,
        total_sessions: 5,
      })
    ).toEqual({ level: "missing", ok: false });
  });

  it("returns degraded when some sessions lack index coverage", () => {
    expect(
      evaluateChatSearchIndexHealth({
        document_count: 3,
        missing_session_count: 2,
        total_sessions: 4,
      })
    ).toEqual({ level: "degraded", ok: false });
  });

  it("returns ok when all sessions are covered", () => {
    expect(
      evaluateChatSearchIndexHealth({
        document_count: 10,
        missing_session_count: 0,
        total_sessions: 3,
      })
    ).toEqual({ level: "ok", ok: true });
  });
});
