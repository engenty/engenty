/**
 * Microphone capture for the cascade transport: mono PCM16 @ 16 kHz frames,
 * base64-encoded for the JSON WS protocol. Uses a ScriptProcessorNode —
 * deprecated but universally supported; an AudioWorklet port is a known
 * follow-up once the cascade is validated end-to-end.
 */

const TARGET_SAMPLE_RATE = 16_000;
const FRAME_SIZE = 4096;

export interface CascadeMicrophoneCapture {
  setMuted: (muted: boolean) => void;
  stop: () => void;
}

export interface CreateCascadeMicrophoneCaptureOptions {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  onFrame: (audioBase64: string) => void;
}

export async function createCascadeMicrophoneCapture({
  getUserMedia = (constraints) =>
    navigator.mediaDevices.getUserMedia(constraints),
  onFrame,
}: CreateCascadeMicrophoneCaptureOptions): Promise<CascadeMicrophoneCapture> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Browser microphone access is unavailable");
  }
  const stream = await getUserMedia({ audio: true });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(FRAME_SIZE, 1, 1);
  let muted = false;

  processor.onaudioprocess = (event) => {
    if (muted) {
      return;
    }
    const input = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleTo16k(input, context.sampleRate);
    onFrame(pcm16ToBase64(downsampled));
  };
  source.connect(processor);
  processor.connect(context.destination);

  return {
    setMuted: (value) => {
      muted = value;
      for (const track of stream.getAudioTracks()) {
        track.enabled = !value;
      }
    },
    stop: () => {
      processor.disconnect();
      source.disconnect();
      for (const track of stream.getTracks()) {
        track.stop();
      }
      void context.close().catch(() => {});
    },
  };
}

export function downsampleTo16k(
  input: Float32Array,
  inputRate: number
): Float32Array {
  if (inputRate === TARGET_SAMPLE_RATE) {
    return input;
  }
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    output[i] = input[Math.floor(i * ratio)] ?? 0;
  }
  return output;
}

export function pcm16ToBase64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, Math.round(clamped * 32_767), true);
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
