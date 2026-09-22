import { describe, expect, it } from "vitest";

import {
  BROWSER_TICKET_TTL_MS,
  mintBrowserTicket,
  verifyBrowserTicket,
} from "../browser-tickets.js";

const payload = {
  sandbox_id: "engenty-browser-t-u",
  tenant_id: "t",
  user_id: "u",
};

describe("browser tickets", () => {
  it("round-trips within the TTL", () => {
    const ticket = mintBrowserTicket(payload, "secret", () => 1000);
    expect(verifyBrowserTicket(ticket, "secret", () => 2000)).toMatchObject(
      payload
    );
  });

  it("expires after 60 s", () => {
    const ticket = mintBrowserTicket(payload, "secret", () => 1000);
    expect(
      verifyBrowserTicket(
        ticket,
        "secret",
        () => 1000 + BROWSER_TICKET_TTL_MS + 1
      )
    ).toBeNull();
  });

  it("refuses a ticket signed with another secret or tampered with", () => {
    const ticket = mintBrowserTicket(payload, "secret", () => 1000);
    expect(verifyBrowserTicket(ticket, "other", () => 2000)).toBeNull();
    const [body, sig] = ticket.split(".");
    const forged = `${Buffer.from(
      JSON.stringify({ ...payload, user_id: "someone-else", exp: 999_999 })
    ).toString("base64url")}.${sig}`;
    expect(verifyBrowserTicket(forged, "secret", () => 2000)).toBeNull();
    expect(body).toBeTruthy();
  });
});
