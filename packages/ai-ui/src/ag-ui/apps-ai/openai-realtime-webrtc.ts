import { realtimeCallErrorMessage } from "./openai-realtime-call-error.js";
import {
  type AppsAiRealtimeSessionResponse,
  type CreateAppsAiRealtimeSessionOptions,
  createAppsAiRealtimeSession,
  isServerCascadeSession,
} from "./realtime-session.js";

const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

function playRemoteAudio(remoteAudio: HTMLAudioElement): void {
  if (typeof remoteAudio.play !== "function") {
    return;
  }
  void remoteAudio.play().catch(() => {});
}

export interface OpenAiRealtimeWebRtcConnection {
  dataChannel: RTCDataChannel;
  disconnect: () => void;
  localStream: MediaStream;
  peerConnection: RTCPeerConnection;
  remoteAudio: HTMLAudioElement;
  sendEvent: (event: unknown) => void;
  setMuted: (muted: boolean) => void;
}

export interface ConnectOpenAiRealtimeWebRtcOptions
  extends CreateAppsAiRealtimeSessionOptions {
  clientEvents?: readonly unknown[];
  createAudioElement?: () => HTMLAudioElement;
  onEvent?: (event: unknown) => void;
  realtimeCallsUrl?: string;
  /** Pre-created session descriptor (skips the session POST). */
  session?: AppsAiRealtimeSessionResponse;
}

export async function connectOpenAiRealtimeWebRtc({
  clientEvents = [],
  createAudioElement = () => document.createElement("audio"),
  onEvent,
  realtimeCallsUrl = OPENAI_REALTIME_CALLS_URL,
  session,
  ...sessionOptions
}: ConnectOpenAiRealtimeWebRtcOptions = {}): Promise<OpenAiRealtimeWebRtcConnection> {
  const peerConnection = new RTCPeerConnection();
  const remoteAudio = createAudioElement();
  remoteAudio.autoplay = true;
  let localStream: MediaStream | null = null;
  let dataChannel: RTCDataChannel | null = null;

  const disconnect = () => {
    dataChannel?.close();
    for (const track of localStream?.getTracks() ?? []) {
      track.stop();
    }
    peerConnection.close();
    remoteAudio.srcObject = null;
  };

  try {
    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        remoteAudio.srcObject = stream;
        playRemoteAudio(remoteAudio);
      }
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Browser microphone access is unavailable");
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error("Browser microphone did not provide audio tracks");
    }
    for (const track of audioTracks) {
      peerConnection.addTrack(track, localStream);
    }

    const realtimeSession =
      session ?? (await createAppsAiRealtimeSession(sessionOptions));
    if (isServerCascadeSession(realtimeSession)) {
      throw new Error(
        "Server-cascade realtime sessions require the cascade transport"
      );
    }

    dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.addEventListener("open", () => {
      for (const clientEvent of clientEvents) {
        dataChannel?.send(JSON.stringify(clientEvent));
      }
    });
    if (onEvent) {
      dataChannel.addEventListener("message", (event) => {
        try {
          onEvent(JSON.parse(event.data));
        } catch {
          onEvent(event.data);
        }
      });
    }

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const response = await fetch(realtimeCallsUrl, {
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${realtimeSession.client_secret.value}`,
        "Content-Type": "application/sdp",
      },
      method: "POST",
      signal: sessionOptions.signal,
    });
    if (!response.ok) {
      throw new Error(await realtimeCallErrorMessage(response));
    }

    await peerConnection.setRemoteDescription({
      sdp: await response.text(),
      type: "answer",
    });
  } catch (error) {
    disconnect();
    throw error;
  }
  if (!(dataChannel && localStream)) {
    disconnect();
    throw new Error("Realtime WebRTC setup failed");
  }

  return {
    dataChannel,
    disconnect,
    localStream,
    peerConnection,
    remoteAudio,
    sendEvent: (event) => {
      if (dataChannel.readyState !== "open") {
        throw new Error("Realtime data channel is not open");
      }
      dataChannel.send(JSON.stringify(event));
    },
    setMuted: (muted) => {
      for (const track of localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    },
  };
}
