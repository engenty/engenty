import { describe, expect, it } from "vitest";

import {
  BROWSER_TICKET_TTL_MS,
  mintBrowserTicket,
  verifyBrowserTicket,
} from "../browser-tickets.js";

const payload = {
  agent_id: "agent-a",
  sandbox_id: "engenty-browser-t-s",
  space_id: "s",
  tenant_id: "t",
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
      JSON.stringify({ ...payload, agent_id: "someone-else", exp: 999_999 })
    ).toString("base64url")}.${sig}`;
    expect(verifyBrowserTicket(forged, "secret", () => 2000)).toBeNull();
    expect(body).toBeTruthy();
  });

  it("refuses a validly signed ticket that names no agent or space", () => {
    const { agent_id: _agent, ...withoutAgent } = payload;
    const ticket = mintBrowserTicket(
      withoutAgent as typeof payload,
      "secret",
      () => 1000
    );
    expect(verifyBrowserTicket(ticket, "secret", () => 2000)).toBeNull();
  });
});
