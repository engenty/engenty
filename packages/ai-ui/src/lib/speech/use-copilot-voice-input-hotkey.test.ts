/** @vitest-environment happy-dom */
import { HotkeyManager } from "@tanstack/react-hotkeys";
import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COPILOT_SPEECH_SCOPE_ATTR,
  COPILOT_VOICE_INPUT_HOTKEY,
  resolveCopilotSpeechScopeRoot,
  shouldHandleCopilotVoiceHotkey,
  useCopilotVoiceInputHotkey,
} from "./use-copilot-voice-input-hotkey.js";

function createScopeWithTextarea(value = "") {
  const scope = document.createElement("div");
  scope.setAttribute(COPILOT_SPEECH_SCOPE_ATTR, "");
  const textarea = document.createElement("textarea");
  textarea.value = value;
  scope.appendChild(textarea);
  document.body.appendChild(scope);
  return { scope, textarea };
}

function dispatchModPeriodKey(target: EventTarget) {
  const isMac =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.platform || navigator.userAgent);
  const event = new KeyboardEvent("keydown", {
    altKey: false,
    bubbles: true,
    cancelable: true,
    code: "Period",
    ctrlKey: !isMac,
    key: ".",
    metaKey: isMac,
    shiftKey: false,
  });
  target.dispatchEvent(event);
  return event;
}

describe("resolveCopilotSpeechScopeRoot", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prefers drawer panel ancestor", () => {
    const drawer = document.createElement("div");
    drawer.setAttribute("data-copilot-drawer-panel", "");
    const composer = document.createElement("div");
    drawer.appendChild(composer);
    document.body.appendChild(drawer);

    expect(resolveCopilotSpeechScopeRoot(composer)).toBe(drawer);
  });
});

describe("shouldHandleCopilotVoiceHotkey", () => {
  it("ignores events outside the copilot scope", () => {
    const { scope, textarea } = createScopeWithTextarea();
    const outside = document.createElement("button");
    document.body.appendChild(outside);

    expect(shouldHandleCopilotVoiceHotkey({ target: outside }, scope)).toBe(
      false
    );
    expect(shouldHandleCopilotVoiceHotkey({ target: textarea }, scope)).toBe(
      true
    );
  });

  it("ignores non-input focus inside the scope", () => {
    const { scope } = createScopeWithTextarea();
    const button = document.createElement("button");
    scope.appendChild(button);
    expect(shouldHandleCopilotVoiceHotkey({ target: button }, scope)).toBe(
      false
    );
  });
});

describe("useCopilotVoiceInputHotkey", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
  });

  afterEach(() => {
    HotkeyManager.resetInstance();
    document.body.innerHTML = "";
  });

  it("registers Mod+. and toggles voice inside copilot scope", () => {
    const { scope, textarea } = createScopeWithTextarea();
    const scopeRef =
      createRef<HTMLElement | null>() as RefObject<HTMLElement | null>;
    scopeRef.current = scope;
    const onToggle = vi.fn();

    renderHook(() =>
      useCopilotVoiceInputHotkey({
        isProcessing: false,
        isSupported: true,
        onToggle,
        scopeRef,
      })
    );

    const manager = HotkeyManager.getInstance();
    const registrations = [...manager.registrations.state.values()];
    expect(
      registrations.some(
        (entry) =>
          entry.hotkey === COPILOT_VOICE_INPUT_HOTKEY &&
          entry.options.meta?.group === "Copilot"
      )
    ).toBe(true);

    act(() => {
      textarea.focus();
      dispatchModPeriodKey(textarea);
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not toggle outside copilot scope", () => {
    const { scope, textarea } = createScopeWithTextarea();
    const scopeRef =
      createRef<HTMLElement | null>() as RefObject<HTMLElement | null>;
    scopeRef.current = scope;
    const onToggle = vi.fn();
    const outside = document.createElement("textarea");
    document.body.appendChild(outside);

    renderHook(() =>
      useCopilotVoiceInputHotkey({
        isProcessing: false,
        isSupported: true,
        onToggle,
        scopeRef,
      })
    );

    act(() => {
      outside.focus();
      dispatchModPeriodKey(outside);
    });

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    const { scope, textarea } = createScopeWithTextarea();
    const scopeRef =
      createRef<HTMLElement | null>() as RefObject<HTMLElement | null>;
    scopeRef.current = scope;
    const onToggle = vi.fn();

    renderHook(() =>
      useCopilotVoiceInputHotkey({
        disabled: true,
        isProcessing: false,
        isSupported: true,
        onToggle,
        scopeRef,
      })
    );

    act(() => {
      dispatchModPeriodKey(textarea);
    });

    expect(onToggle).not.toHaveBeenCalled();
  });
});
