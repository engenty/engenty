import { describe, expect, it, vi } from "vitest";
import {
  queueCopilotComposerDraft,
  registerCopilotComposerDraftSetter,
  setCopilotComposerDraft,
} from "./copilot-composer-draft-intent";

describe("copilot composer draft intent", () => {
  it("prefills the mounted composer", () => {
    const setter = vi.fn();
    const off = registerCopilotComposerDraftSetter("host:a", setter);
    expect(setCopilotComposerDraft("host:a", "hello")).toBe(true);
    expect(setter).toHaveBeenCalledWith("hello");
    off();
  });

  it("reports no composer rather than swallowing the text", () => {
    expect(setCopilotComposerDraft("host:none", "hello")).toBe(false);
  });

  it("hands a queued draft to the composer that mounts next", () => {
    // The blob's floating prompt can start a chat on another page: the text
    // exists a whole navigation before its composer does.
    queueCopilotComposerDraft("host:b", "written before the route changed");
    const setter = vi.fn();
    const off = registerCopilotComposerDraftSetter("host:b", setter);
    expect(setter).toHaveBeenCalledWith("written before the route changed");
    off();
  });

  it("drains the queue once, not onto every later composer", () => {
    queueCopilotComposerDraft("host:c", "once");
    const first = vi.fn();
    registerCopilotComposerDraftSetter("host:c", first)();
    const second = vi.fn();
    const off = registerCopilotComposerDraftSetter("host:c", second);
    expect(first).toHaveBeenCalledWith("once");
    expect(second).not.toHaveBeenCalled();
    off();
  });

  it("goes straight to a composer that is already mounted", () => {
    const setter = vi.fn();
    const off = registerCopilotComposerDraftSetter("host:d", setter);
    queueCopilotComposerDraft("host:d", "now");
    expect(setter).toHaveBeenCalledWith("now");
    off();
    const later = vi.fn();
    const offLater = registerCopilotComposerDraftSetter("host:d", later);
    expect(later).not.toHaveBeenCalled();
    offLater();
  });
});
