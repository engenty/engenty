import type { CascadeServerMessage } from "@engenty/ai-core";
import { describe, expect, it, vi } from "vitest";
import {
  generateCascadeTicketSecret,
  mintCascadeTicket,
  verifyCascadeTicket,
} from "../api/cascade/cascade-tickets.js";
import {
  type CascadeTtsLeg,
  createCascadeOrchestrator,
} from "../api/cascade/orchestrator.js";
import { createSessionAgentTurn } from "../api/cascade/session-agent-turn.js";
import { createVoxtralElevenLabsProvider } from "../api/providers/voxtral-elevenlabs.js";

const TICKET_FIELDS = {
  stt_model: "voxtral-mini-transcribe-realtime-2602",
  tenant_id: "tenant-1",
  tts_model: "eleven_flash_v2_5",
  tts_voice: "voice-austria",
  user_id: "user-1",
};

describe("cascade tickets", () => {
  it("mints and verifies a ticket roundtrip", () => {
    const secret = generateCascadeTicketSecret();
    const ticket = mintCascadeTicket(TICKET_FIELDS, secret);
    expect(verifyCascadeTicket(ticket, secret)).toMatchObject(TICKET_FIELDS);
  });

  it("rejects tampered and wrong-secret tickets", () => {
    const secret = generateCascadeTicketSecret();
    const ticket = mintCascadeTicket(TICKET_FIELDS, secret);
    expect(verifyCascadeTicket(ticket, generateCascadeTicketSecret())).toBe(
      null
    );
    const [body, sig] = ticket.split(".");
    const tampered = `${Buffer.from(
      JSON.stringify({
        ...TICKET_FIELDS,
        tenant_id: "evil",
        exp: Date.now() + 60_000,
      })
    ).toString("base64url")}.${sig}`;
    expect(verifyCascadeTicket(tampered, secret)).toBe(null);
    expect(verifyCascadeTicket(`${body}`, secret)).toBe(null);
  });

  it("rejects expired tickets", () => {
    const secret = generateCascadeTicketSecret();
    const ticket = mintCascadeTicket(TICKET_FIELDS, secret, () => 1000);
    expect(verifyCascadeTicket(ticket, secret, () => 100_000)).toBe(null);
  });
});

function createFakeTts(): CascadeTtsLeg & { spoken: string[]; log: string[] } {
  const spoken: string[] = [];
  const log: string[] = [];
  return {
    cancel: () => log.push("cancel"),
    close: () => log.push("close"),
    flush: () => log.push("flush"),
    log,
    speak: (text) => {
      spoken.push(text);
      log.push(`speak:${text}`);
    },
    spoken,
  };
}

describe("cascade orchestrator", () => {
  it("runs an agent turn on final transcript and streams to TTS", async () => {
    const sent: CascadeServerMessage[] = [];
    const tts = createFakeTts();
    const orchestrator = createCascadeOrchestrator({
      async *runAgentTurn() {
        yield "Grüß ";
        yield "Gott!";
      },
      send: (m) => sent.push(m),
      tts,
    });

    orchestrator.onUserTranscript({ final: false, text: "Servus" });
    orchestrator.onUserTranscript({ final: true, text: "Servus" });
    await vi.waitFor(() => expect(tts.log).toContain("flush"));

    expect(tts.spoken).toEqual(["Grüß ", "Gott!"]);
    expect(sent).toContainEqual({
      type: "transcript",
      done: true,
      mode: "replace",
      role: "user",
      text: "Servus",
    });
    expect(sent).toContainEqual({
      type: "transcript",
      mode: "append",
      role: "assistant",
      text: "Grüß ",
    });
    expect(sent.at(-1)).toEqual({ type: "status", status: "listening" });
  });

  it("barge-in: user speech cancels the running turn and TTS", async () => {
    const sent: CascadeServerMessage[] = [];
    const tts = createFakeTts();
    const gate2: { release: (() => void) | null } = { release: null };
    const gate = new Promise<void>((resolve) => {
      gate2.release = resolve;
    });
    const orchestrator = createCascadeOrchestrator({
      async *runAgentTurn({ signal }) {
        yield "Lange ";
        await gate;
        if (signal.aborted) {
          return;
        }
        yield "Antwort";
      },
      send: (m) => sent.push(m),
      tts,
    });

    orchestrator.onUserTranscript({ final: true, text: "Erste Frage" });
    await vi.waitFor(() => expect(tts.spoken).toEqual(["Lange "]));

    // User interrupts mid-turn.
    orchestrator.onUserTranscript({ final: false, text: "Moment" });
    expect(tts.log).toContain("cancel");
    expect(sent).toContainEqual({ type: "speech-started" });

    gate2.release?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The aborted turn never spoke its second chunk and never flushed.
    expect(tts.spoken).toEqual(["Lange "]);
    expect(tts.log).not.toContain("flush");
  });

  it("close aborts the turn and closes TTS", async () => {
    const tts = createFakeTts();
    const orchestrator = createCascadeOrchestrator({
      async *runAgentTurn() {
        yield "Hallo";
      },
      send: () => {},
      tts,
    });
    orchestrator.close();
    orchestrator.onUserTranscript({ final: true, text: "ignored" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tts.log).toContain("close");
    expect(tts.spoken).toEqual([]);
  });
});

describe("voxtral-elevenlabs provider", () => {
  const scope = { tenantId: "tenant-1", userId: "user-1" };

  it("mints a server-cascade descriptor with a verifiable ticket", async () => {
    const secret = generateCascadeTicketSecret();
    const provider = createVoxtralElevenLabsProvider({
      cascadeWsPath: "/ai/v1/realtime/cascade",
      elevenLabsApiKey: () => "el-key",
      mistralApiKey: () => "mi-key",
      ticketSecret: secret,
    });
    const descriptor = await provider.createSession(
      scope,
      { instructions: "Sei hilfreich" },
      { elevenlabs_voice_id: "voice-austria", voice_register: "de-AT" }
    );
    expect(descriptor).toMatchObject({
      kind: "server-cascade",
      provider: "voxtral-elevenlabs",
      language_hint: "de-AT",
      tts_voice: "voice-austria",
    });
    if (descriptor.kind !== "server-cascade") {
      throw new Error("expected cascade descriptor");
    }
    const ticket = new URL(
      descriptor.ws_url,
      "http://localhost"
    ).searchParams.get("ticket");
    expect(verifyCascadeTicket(ticket ?? "", secret)).toMatchObject({
      instructions: "Sei hilfreich",
      tenant_id: "tenant-1",
      tts_voice: "voice-austria",
      user_id: "user-1",
    });
  });

  it("fails 503 when vendor keys or voice are missing", async () => {
    const provider = createVoxtralElevenLabsProvider({
      cascadeWsPath: "/ai/v1/realtime/cascade",
      elevenLabsApiKey: () => null,
      mistralApiKey: () => "mi-key",
      ticketSecret: "secret",
    });
    await expect(provider.createSession(scope, {}, null)).rejects.toMatchObject(
      { code: "realtime.cascadeApiKeysMissing", status: 503 }
    );
    const noVoice = createVoxtralElevenLabsProvider({
      cascadeWsPath: "/ai/v1/realtime/cascade",
      elevenLabsApiKey: () => "el-key",
      mistralApiKey: () => "mi-key",
      ticketSecret: "secret",
    });
    await expect(noVoice.createSession(scope, {}, null)).rejects.toMatchObject({
      code: "realtime.cascadeVoiceMissing",
      status: 503,
    });
  });
});

describe("session agent turn", () => {
  it("creates one thread per connection and appends per utterance", async () => {
    const calls: string[] = [];
    const sessions = {
      appendMessage: vi.fn(async (input: { threadId: string }) => {
        calls.push(`append:${input.threadId}`);
        return {};
      }),
      createThread: vi.fn(async () => {
        calls.push("create");
        return { thread: { id: "thread-1" } };
      }),
      generate: vi.fn(async () => {
        calls.push("generate");
        return { text: "Grüß Gott" };
      }),
    };
    const turn = createSessionAgentTurn({
      instructions: "Sei knapp",
      scope: { tenantId: "t", userId: "u" },
      sessions,
    });

    const collect = async (text: string) => {
      const chunks: string[] = [];
      for await (const chunk of turn({
        signal: new AbortController().signal,
        text,
      })) {
        chunks.push(chunk);
      }
      return chunks;
    };

    expect(await collect("Hallo")).toEqual(["Grüß Gott"]);
    expect(await collect("Noch was")).toEqual(["Grüß Gott"]);
    expect(sessions.createThread).toHaveBeenCalledTimes(1);
    // instructions + 2 utterances
    expect(sessions.appendMessage).toHaveBeenCalledTimes(3);
  });
});
