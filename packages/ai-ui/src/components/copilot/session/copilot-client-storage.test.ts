import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCopilotPersistedClientStorage } from "./copilot-client-storage.js";

describe("copilot-client-storage", () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    const ls = {
      clear: () => memory.clear(),
      getItem: (key: string) => memory.get(key) ?? null,
      get length() {
        return memory.size;
      },
      key: (i: number) => [...memory.keys()][i] ?? null,
      removeItem: (key: string) => void memory.delete(key),
      setItem: (key: string, value: string) => void memory.set(key, value),
    };
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("window", { localStorage: ls });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes copilot transcript, agent selection, and session binding keys", () => {
    memory.set("engenty.copilot.session.v1:full-page-chat", "{}");
    memory.set("engenty.copilot.session.v1:global-copilot", "{}");
    memory.set("copilot.selectedAgent:full-page-chat", "engenty.copilot");
    memory.set(
      "copilot.agentSession:global-copilot",
      "00000000-0000-4000-8000-000000000001"
    );
    memory.set("unrelated:key", "keep");

    clearCopilotPersistedClientStorage();

    expect(memory.has("engenty.copilot.session.v1:full-page-chat")).toBe(false);
    expect(memory.has("engenty.copilot.session.v1:global-copilot")).toBe(false);
    expect(memory.has("copilot.selectedAgent:full-page-chat")).toBe(false);
    expect(memory.has("copilot.agentSession:global-copilot")).toBe(false);
    expect(memory.get("unrelated:key")).toBe("keep");
  });
});
