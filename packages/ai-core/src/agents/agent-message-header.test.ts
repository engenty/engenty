import { describe, expect, it } from "vitest";
import {
  formatAgentMessageHeader,
  parseAgentMessageHeader,
} from "./agent-message-header.js";

describe("agent message header", () => {
  it("round-trips sender and body", () => {
    const text = `${formatAgentMessageHeader("Chief of Staff", "chief-of-staff")}Was steht an?`;
    expect(parseAgentMessageHeader(text)).toEqual({
      body: "Was steht an?",
      senderId: "chief-of-staff",
      senderName: "Chief of Staff",
    });
  });

  it("reads the header through a persisted speaker envelope and keeps the envelope on the body", () => {
    const open =
      '<turn author_id="u1" author_name="Matthias" functional_role="user">\n';
    const text = `${open}${formatAgentMessageHeader("Chief of Staff", "chief-of-staff")}Was steht an?\n</turn>`;
    expect(parseAgentMessageHeader(text)).toEqual({
      body: `${open}Was steht an?\n</turn>`,
      senderId: "chief-of-staff",
      senderName: "Chief of Staff",
    });
  });

  it("is null for an ordinary message", () => {
    expect(parseAgentMessageHeader("Message from nobody")).toBeNull();
    expect(
      parseAgentMessageHeader("hello **Message from X** (engenty `x`)\n")
    ).toBeNull();
  });
});
