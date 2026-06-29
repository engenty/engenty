/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCopilotLocalRecoveryStorageKey,
  clearCopilotComposerDraft,
  writeCopilotComposerDraft,
} from "./local-recovery.js";

describe("copilot thread actions draft hygiene", () => {
  const tenantId = "tenant-a";
  const userId = "user-b";

  afterEach(() => {
    window.localStorage.clear();
  });

  it("clears the /new composer draft key before starting a fresh chat", () => {
    writeCopilotComposerDraft({
      composerDraft: "ok",
      tenantId,
      threadId: "new",
      userId,
    });

    clearCopilotComposerDraft({
      tenantId,
      threadId: "new",
      userId,
    });

    expect(
      window.localStorage.getItem(
        buildCopilotLocalRecoveryStorageKey({
          tenantId,
          threadId: "new",
          userId,
        })
      )
    ).toBeNull();
  });
});
