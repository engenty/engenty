import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Short-lived HMAC tickets that authorize one cascade WS connection. The
 * session route mints them (authenticated request); the WS handler verifies
 * on connect — the socket itself carries no other credentials.
 */

const TICKET_TTL_MS = 60_000;

export interface CascadeTicketPayload {
  exp: number;
  instructions?: string;
  language_hint?: string;
  stt_model: string;
  tenant_id: string;
  tts_model: string;
  tts_voice: string;
  user_id: string;
}

export type CascadeTicketClock = () => number;

/** Process-local fallback: tickets only verify against the minting process. */
export function generateCascadeTicketSecret(): string {
  return randomBytes(32).toString("hex");
}

export function mintCascadeTicket(
  payload: Omit<CascadeTicketPayload, "exp">,
  secret: string,
  now: CascadeTicketClock = Date.now
): string {
  const body = base64Url(
    JSON.stringify({ ...payload, exp: now() + TICKET_TTL_MS })
  );
  return `${body}.${signCascadeTicket(body, secret)}`;
}

export function verifyCascadeTicket(
  ticket: string,
  secret: string,
  now: CascadeTicketClock = Date.now
): CascadeTicketPayload | null {
  const [body, signature] = ticket.split(".");
  if (!(body && signature)) {
    return null;
  }
  const expected = signCascadeTicket(body, secret);
  const provided = Buffer.from(signature);
  if (
    provided.length !== Buffer.from(expected).length ||
    !timingSafeEqual(provided, Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as CascadeTicketPayload;
    if (typeof payload.exp !== "number" || payload.exp < now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function signCascadeTicket(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
