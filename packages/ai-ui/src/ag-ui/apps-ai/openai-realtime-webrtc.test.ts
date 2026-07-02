/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectOpenAiRealtimeWebRtc } from "./openai-realtime-webrtc.js";

class MockMediaStreamTrack {
  enabled = true;
  stop = vi.fn();
}

class MockMediaStream {
  private readonly track = new MockMediaStreamTrack();

  getAudioTracks() {
    return [this.track] as unknown as MediaStreamTrack[];
  }

  getTracks() {
    return [this.track] as unknown as MediaStreamTrack[];
  }
}

class EmptyMockMediaStream {
  getAudioTracks() {
    return [] as unknown as MediaStreamTrack[];
  }

  getTracks() {
    return [] as unknown as MediaStreamTrack[];
  }
}

class MockDataChannel extends EventTarget {
  close = vi.fn();
  readyState = "open";
  send = vi.fn();
}

let lastPeerConnection: MockRTCPeerConnection | null = null;

class MockRTCPeerConnection {
  addTrack = vi.fn();
  close = vi.fn();
  createDataChannel = vi.fn(() => new MockDataChannel());
  createOffer = vi.fn(async () => ({ sdp: "offer-sdp", type: "offer" }));
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  setLocalDescription = vi.fn();
  setRemoteDescription = vi.fn();

  constructor() {
    lastPeerConnection = this;
  }
}

describe("connectOpenAiRealtimeWebRtc", () => {
  afterEach(() => {
    lastPeerConnection = null;
    vi.unstubAllGlobals();
  });

  it("creates a WebRTC call using an apps/ai minted client secret", async () => {
    const localStream = new MockMediaStream();
    const remoteStream = new MockMediaStream();
    const onEvent = vi.fn();
    const remoteAudio = {
      autoplay: false,
      play: vi.fn(async () => {}),
      srcObject: null,
    } as unknown as HTMLAudioElement;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          provider: "openai",
          model: "gpt-realtime-2",
          voice: "marin",
          client_secret: { expires_at: 1_800_000_000, value: "ek_test" },
        })
      )
      .mockResolvedValueOnce(new Response("answer-sdp"));
    const mediaDevices = {
      getUserMedia: vi.fn(async () => localStream),
    };

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: mediaDevices,
    });

    const connection = await connectOpenAiRealtimeWebRtc({
      baseUrl: "https://ai.engenty_localhost",
      createAudioElement: () => remoteAudio,
      headers: { Authorization: "Bearer user-token" },
      onEvent,
      realtimeCallsUrl: "https://api.openai.test/v1/realtime/calls",
    });

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.openai.test/v1/realtime/calls",
      expect.objectContaining({
        body: "offer-sdp",
        headers: {
          Authorization: "Bearer ek_test",
          "Content-Type": "application/sdp",
        },
        method: "POST",
      })
    );
    expect(connection.peerConnection.setRemoteDescription).toHaveBeenCalledWith(
      {
        sdp: "answer-sdp",
        type: "answer",
      }
    );
    expect(connection.remoteAudio.autoplay).toBe(true);

    lastPeerConnection?.ontrack?.({
      streams: [remoteStream as unknown as MediaStream],
    });
    expect(connection.remoteAudio.srcObject).toBe(remoteStream);
    expect(remoteAudio.play).toHaveBeenCalledTimes(1);

    connection.dataChannel.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({ type: "response.output_audio.delta" }),
      })
    );
    connection.dataChannel.dispatchEvent(
      new MessageEvent("message", { data: "raw-event" })
    );
    expect(onEvent).toHaveBeenCalledWith({
      type: "response.output_audio.delta",
    });
    expect(onEvent).toHaveBeenCalledWith("raw-event");

    connection.sendEvent({ type: "response.create" });
    expect(connection.dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "response.create" })
    );

    connection.setMuted(true);
    expect(localStream.getAudioTracks()[0]?.enabled).toBe(false);
    connection.setMuted(false);
    expect(localStream.getAudioTracks()[0]?.enabled).toBe(true);

    connection.disconnect();
    expect(connection.dataChannel.close).toHaveBeenCalled();
    expect(localStream.getTracks()[0]?.stop).toHaveBeenCalled();
    expect(connection.peerConnection.close).toHaveBeenCalled();
    expect(connection.remoteAudio.srcObject).toBeNull();
  });

  it("cleans up opened media resources when the realtime call fails", async () => {
    const localStream = new MockMediaStream();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          provider: "openai",
          model: "gpt-realtime-2",
          voice: "marin",
          client_secret: { expires_at: 1_800_000_000, value: "ek_test" },
        })
      )
      .mockResolvedValueOnce(new Response("failed", { status: 502 }));
    const mediaDevices = {
      getUserMedia: vi.fn(async () => localStream),
    };

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: mediaDevices,
    });

    await expect(
      connectOpenAiRealtimeWebRtc({
        baseUrl: "https://ai.engenty_localhost",
        headers: { Authorization: "Bearer user-token" },
        realtimeCallsUrl: "https://api.openai.test/v1/realtime/calls",
      })
    ).rejects.toThrow("Realtime WebRTC call failed (502): failed");

    expect(localStream.getTracks()[0]?.stop).toHaveBeenCalled();
    expect(lastPeerConnection?.close).toHaveBeenCalled();
  });

  it("surfaces the OpenAI error code and message when the realtime call fails", async () => {
    const localStream = new MockMediaStream();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          provider: "openai",
          model: "gpt-realtime-2",
          voice: "marin",
          client_secret: { expires_at: 1_800_000_000, value: "ek_test" },
        })
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: "insufficient_quota",
              message: "You exceeded your current quota.",
            },
          },
          { status: 429 }
        )
      );
    const mediaDevices = {
      getUserMedia: vi.fn(async () => localStream),
    };

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: mediaDevices,
    });

    await expect(
      connectOpenAiRealtimeWebRtc({
        baseUrl: "https://ai.engenty_localhost",
        headers: { Authorization: "Bearer user-token" },
        realtimeCallsUrl: "https://api.openai.test/v1/realtime/calls",
      })
    ).rejects.toThrow(
      "Realtime WebRTC call failed (429): insufficient_quota: You exceeded your current quota."
    );

    expect(localStream.getTracks()[0]?.stop).toHaveBeenCalled();
    expect(lastPeerConnection?.close).toHaveBeenCalled();
  });

  it("fails cleanly when browser microphone access is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        provider: "openai",
        model: "gpt-realtime-2",
        voice: "marin",
        client_secret: { expires_at: 1_800_000_000, value: "ek_test" },
      })
    );

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });

    await expect(
      connectOpenAiRealtimeWebRtc({
        baseUrl: "https://ai.engenty_localhost",
        headers: { Authorization: "Bearer user-token" },
      })
    ).rejects.toThrow("Browser microphone access is unavailable");

    expect(lastPeerConnection?.close).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails cleanly when the browser returns no microphone tracks", async () => {
    const localStream = new EmptyMockMediaStream();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        provider: "openai",
        model: "gpt-realtime-2",
        voice: "marin",
        client_secret: { expires_at: 1_800_000_000, value: "ek_test" },
      })
    );
    const mediaDevices = {
      getUserMedia: vi.fn(async () => localStream),
    };

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: mediaDevices,
    });

    await expect(
      connectOpenAiRealtimeWebRtc({
        baseUrl: "https://ai.engenty_localhost",
        headers: { Authorization: "Bearer user-token" },
      })
    ).rejects.toThrow("Browser microphone did not provide audio tracks");

    expect(lastPeerConnection?.addTrack).not.toHaveBeenCalled();
    expect(lastPeerConnection?.close).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
