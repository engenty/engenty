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
import { createVoxtralElevenLabsProvider } from "../api/providers/voxtral-elevenlabs.js";

const TICKET_FIELDS = {
  stt_model: "voxtral-mini-transcribe-realtime-2602",
  tenant_id: "tenant-1",
  tts_model: "eleven_flash_v2_5",
  tts_voice: "voice-austria",
  user_id: "user-1",
};

describe("cascade tickets", () => {
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

  it("mints a ticket bound to the caller's tenant and user", async () => {
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
    if (descriptor.kind !== "server-cascade") {
      throw new Error("expected cascade descriptor");
    }
    const ticket = new URL(
      descriptor.ws_url,
      "http://localhost"
    ).searchParams.get("ticket");
    expect(verifyCascadeTicket(ticket ?? "", secret)).toMatchObject({
      tenant_id: "tenant-1",
      user_id: "user-1",
    });
  });
});
