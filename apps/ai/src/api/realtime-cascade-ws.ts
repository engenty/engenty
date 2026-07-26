import {
  type CascadeClientMessage,
  type CascadeServerMessage,
  parseCascadeMessage,
} from "@engenty/ai-core";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";
import { AI_BASE_PATH } from "../config/constants.js";
import {
  type CascadeTicketPayload,
  verifyCascadeTicket,
} from "./cascade/cascade-tickets.js";
import type { CascadeAgentTurn } from "./cascade/orchestrator.js";
import {
  type CascadeOrchestrator,
  type CascadeSttLeg,
  type CascadeTtsLeg,
  createCascadeOrchestrator,
} from "./cascade/orchestrator.js";

export const REALTIME_CASCADE_WS_PATH = `${AI_BASE_PATH}/v1/realtime/cascade`;

export interface CascadeLegFactories {
  createAgentTurn: (ticket: CascadeTicketPayload) => CascadeAgentTurn;
  createSttLeg: (
    ticket: CascadeTicketPayload,
    handlers: {
      onError: (message: string) => void;
      onTranscript: (update: { final: boolean; text: string }) => void;
    }
  ) => CascadeSttLeg;
  createTtsLeg: (
    ticket: CascadeTicketPayload,
    handlers: {
      onAudio: (audioBase64: string, done: boolean) => void;
      onError: (message: string) => void;
    }
  ) => CascadeTtsLeg;
}

export interface RegisterRealtimeCascadeWsOptions extends CascadeLegFactories {
  ticketSecret: string;
  upgradeWebSocket: UpgradeWebSocket;
}

/**
 * The cascade broker: one WS connection per voice call, authorized by a
 * short-lived ticket minted by the session route. Vendor sockets live only
 * here — the browser never sees an API key.
 */
export function registerRealtimeCascadeWs(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  opts: RegisterRealtimeCascadeWsOptions
): void {
  app.get(
    REALTIME_CASCADE_WS_PATH,
    opts.upgradeWebSocket((c) => {
      const ticket = verifyCascadeTicket(
        c.req.query("ticket") ?? "",
        opts.ticketSecret
      );
      let stt: CascadeSttLeg | null = null;
      let orchestrator: CascadeOrchestrator | null = null;
      let muted = false;

      return {
        onOpen(_event, ws) {
          if (!ticket) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "realtime.cascadeTicketInvalid",
              } satisfies CascadeServerMessage)
            );
            ws.close();
            return;
          }
          const send = (message: CascadeServerMessage) => {
            ws.send(JSON.stringify(message));
          };
          const tts = opts.createTtsLeg(ticket, {
            onAudio: (audio, done) => send({ type: "audio", audio, done }),
            onError: (message) => send({ type: "error", message }),
          });
          orchestrator = createCascadeOrchestrator({
            runAgentTurn: opts.createAgentTurn(ticket),
            send,
            tts,
          });
          stt = opts.createSttLeg(ticket, {
            onError: (message) => send({ type: "error", message }),
            onTranscript: (update) => orchestrator?.onUserTranscript(update),
          });
          send({ type: "status", status: "listening" });
        },
        onMessage(event) {
          const message = parseCascadeMessage<CascadeClientMessage>(
            typeof event.data === "string" ? event.data : null
          );
          if (!message) {
            return;
          }
          if (message.type === "audio" && !muted) {
            stt?.write(message.audio);
          } else if (message.type === "mute") {
            muted = message.muted;
          }
          // tool-output: routed to the agent turn in the tool-loop follow-up;
          // server-side tools already run inside sessions.generate.
        },
        onClose() {
          stt?.close();
          stt = null;
          orchestrator?.close();
          orchestrator = null;
        },
      };
    })
  );
}
