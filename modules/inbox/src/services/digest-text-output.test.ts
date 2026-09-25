import { describe, expect, it } from "vitest";
import {
  parseMessageDigestText,
  parseThreadSummaryText,
  stripWrappingFence,
} from "./digest-text-output.js";

describe("stripWrappingFence", () => {
  it("drops a fence around the whole answer only", () => {
    expect(stripWrappingFence("```text\nHEADLINE: hi\n```")).toBe(
      "HEADLINE: hi"
    );
    const inner = "Intro\n```\ncode\n```";
    expect(stripWrappingFence(inner)).toBe(inner);
  });
});

describe("parseMessageDigestText", () => {
  it("reads the labelled header and keeps the body verbatim", () => {
    expect(
      parseMessageDigestText(
        "CATEGORY: newsletter\nATTACHMENTS: 0, 2\nCONTENT:\n## Update\n\n- one\n- two\nCategory: not a header here"
      )
    ).toEqual({
      category: "newsletter",
      content_markdown:
        "## Update\n\n- one\n- two\nCategory: not a header here",
      keep_attachment_indexes: [0, 2],
    });
  });

  it("tolerates bold labels, 'none', and a wrapping fence", () => {
    expect(
      parseMessageDigestText(
        "```\n**Category:** `Conversation`\n**Attachments:** none\n**Content:**\nKannst du mir ein Angebot schicken?\n```"
      )
    ).toEqual({
      category: "conversation",
      content_markdown: "Kannst du mir ein Angebot schicken?",
      keep_attachment_indexes: [],
    });
  });

  it("treats unlabelled text as the body when CONTENT: is missing", () => {
    expect(
      parseMessageDigestText("CATEGORY: conversation\nHallo, passt Montag?")
    ).toEqual({
      category: "conversation",
      content_markdown: "Hallo, passt Montag?",
      keep_attachment_indexes: [],
    });
  });

  it("returns null without any body", () => {
    expect(parseMessageDigestText("CATEGORY: spam\nCONTENT:\n")).toBeNull();
    expect(parseMessageDigestText("")).toBeNull();
  });
});

describe("parseThreadSummaryText", () => {
  it("parses all sections", () => {
    expect(
      parseThreadSummaryText(
        [
          "HEADLINE: Anna asks to confirm Monday 10:00.",
          "OPEN:",
          "- Confirm the meeting",
          "- Send the quote",
          "ACTIONS:",
          "- Draft a reply confirming Monday 10:00",
          "1. Turn the quote request into a task",
          "PARTICIPANTS:",
          "- Anna@Example.com | Anna Huber | customer",
          "- bob@example.com | - | cc'd colleague",
        ].join("\n")
      )
    ).toEqual({
      headline: "Anna asks to confirm Monday 10:00.",
      open_points: ["Confirm the meeting", "Send the quote"],
      participants: [
        { email: "anna@example.com", name: "Anna Huber", role: "customer" },
        { email: "bob@example.com", name: null, role: "cc'd colleague" },
      ],
      suggested_actions: [
        "Draft a reply confirming Monday 10:00",
        "Turn the quote request into a task",
      ],
    });
  });

  it("returns empty sections when missing and drops 'none' items", () => {
    expect(
      parseThreadSummaryText(
        "## Headline: Newsletter, nothing to do.\n**Open:**\n- none\nACTIONS: File it"
      )
    ).toEqual({
      headline: "Newsletter, nothing to do.",
      open_points: [],
      participants: [],
      suggested_actions: ["File it"],
    });
  });

  it("uses leading prose as the headline and keeps stray lines in a section", () => {
    const parsed = parseThreadSummaryText(
      "Tom sends the signed contract.\n\nOPEN:\nCheck the signature page\nPARTICIPANTS:\nno address here"
    );
    expect(parsed.headline).toBe("Tom sends the signed contract.");
    expect(parsed.open_points).toEqual(["Check the signature page"]);
    expect(parsed.participants).toEqual([]);
  });
});
