import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Short-lived HMAC tickets that authorize ONE browser view connection
 * (PLAN-user-browser.md §2.5). The ticket route mints them (authenticated,
 * owner-only); the WS handler verifies on connect — the socket carries no
 * other credential. Same shape as the cascade tickets, own payload.
 */

export const BROWSER_TICKET_TTL_MS = 60_000;

export interface BrowserTicketPayload {
  exp: number;
  sandbox_id: string;
  space_id: string;
  tenant_id: string;
  user_id: string;
}

export type BrowserTicketClock = () => number;

export function generateBrowserTicketSecret(): string {
  return randomBytes(32).toString("hex");
}

export function mintBrowserTicket(
  payload: Omit<BrowserTicketPayload, "exp">,
  secret: string,
  now: BrowserTicketClock = Date.now
): string {
  const body = base64Url(
    JSON.stringify({ ...payload, exp: now() + BROWSER_TICKET_TTL_MS })
  );
  return `${body}.${sign(body, secret)}`;
}

export function verifyBrowserTicket(
  ticket: string,
  secret: string,
  now: BrowserTicketClock = Date.now
): BrowserTicketPayload | null {
  const [body, signature] = ticket.split(".");
  if (!(body && signature)) {
    return null;
  }
  const expected = sign(body, secret);
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
    ) as BrowserTicketPayload;
    if (
      typeof payload.exp !== "number" ||
      payload.exp < now() ||
      typeof payload.sandbox_id !== "string" ||
      typeof payload.user_id !== "string" ||
      typeof payload.tenant_id !== "string" ||
      typeof payload.space_id !== "string"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}
