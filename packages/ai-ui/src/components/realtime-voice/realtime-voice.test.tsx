/** @vitest-environment happy-dom */
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RealtimeVoiceCallStrip,
  useRealtimeVoiceUiState,
} from "./realtime-voice.js";

afterEach(() => {
  cleanup();
});

describe("useRealtimeVoiceUiState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves from connecting to listening when local stub starts", () => {
    const { result } = renderHook(() =>
      useRealtimeVoiceUiState({ autoListenDelayMs: 200 })
    );

    act(() => result.current.start());

    expect(result.current.status).toBe("connecting");

    act(() => vi.advanceTimersByTime(200));

    expect(result.current.status).toBe("listening");
    expect(result.current.isActive).toBe(true);
  });

  it("toggles mute and ends the local voice session", () => {
    const { result } = renderHook(() =>
      useRealtimeVoiceUiState({ autoListenDelayMs: 0 })
    );

    act(() => {
      result.current.start();
      vi.runOnlyPendingTimers();
    });
    act(() => result.current.toggleMute());

    expect(result.current.status).toBe("muted");
    expect(result.current.isMuted).toBe(true);

    act(() => result.current.end());

    expect(result.current.status).toBe("ended");
    expect(result.current.isActive).toBe(false);
  });
});

describe("RealtimeVoiceCallStrip", () => {
  it("renders status and calls mute/end handlers", async () => {
    const user = userEvent.setup();
    const onEnd = vi.fn();
    const onToggleMute = vi.fn();

    render(
      <RealtimeVoiceCallStrip
        labels={{
          end: "End live voice",
          listening: "Listening now",
          mute: "Mute live voice",
        }}
        onEnd={onEnd}
        onToggleMute={onToggleMute}
        status="listening"
      />
    );

    expect(screen.getByText("Listening now")).toBeTruthy();

    await user.click(screen.getByLabelText("Mute live voice"));
    await user.click(screen.getByLabelText("End live voice"));

    expect(onToggleMute).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("keeps the end control available in an error state", async () => {
    const user = userEvent.setup();
    const onEnd = vi.fn();
    const onToggleMute = vi.fn();

    render(
      <RealtimeVoiceCallStrip
        disabled
        error="Microphone unavailable"
        labels={{
          end: "Dismiss live voice error",
          mute: "Mute live voice",
        }}
        onEnd={onEnd}
        onToggleMute={onToggleMute}
        status="error"
      />
    );

    expect(
      (screen.getByLabelText("Mute live voice") as HTMLButtonElement).disabled
    ).toBe(true);
    await user.click(screen.getByLabelText("Dismiss live voice error"));

    expect(onToggleMute).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
