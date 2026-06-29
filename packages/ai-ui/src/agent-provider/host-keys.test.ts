import { describe, expect, it } from "vitest";
import {
  ACTIVE_COPILOT_AGENT_ID,
  ENGENTY_COPILOT_HOST_KEY,
} from "./host-keys.js";

// `engenty:copilot` is the single main copilot host. Renaming either string is a
// breaking contract change across apps/ui, engenty-copilot, and apps/ai affinity.
describe("active copilot host constants", () => {
  it("uses engenty:copilot as the main copilot hostKey", () => {
    expect(ENGENTY_COPILOT_HOST_KEY).toBe("engenty:copilot");
  });

  it("locks the main copilot host to engenty.copilot registry agent id", () => {
    expect(ACTIVE_COPILOT_AGENT_ID).toBe("engenty.copilot");
  });
});
