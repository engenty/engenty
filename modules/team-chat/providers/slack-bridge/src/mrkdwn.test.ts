import { describe, expect, it } from "vitest";
import { markdownToMrkdwn, mrkdwnToMarkdown } from "./mrkdwn.js";

const UUID = "0f0e0d0c-0b0a-0908-0706-050403020100";

describe("markdownToMrkdwn", () => {
  it("maps bold/italic/strike/links", () => {
    expect(
      markdownToMrkdwn(
        "**bold** and *it* and ~~gone~~ see [docs](https://x.y/z)"
      )
    ).toBe("*bold* and _it_ and ~gone~ see <https://x.y/z|docs>");
  });

  it("maps mention tokens via user map, name fallback, agents, broadcasts", () => {
    expect(
      markdownToMrkdwn(
        `hey <@u:${UUID}> <@agent:engenty.coordinator> <!here>`,
        {
          toSlackUser: { [UUID]: "U12345" },
        }
      )
    ).toBe("hey <@U12345> @engenty.coordinator <!here>");
    expect(
      markdownToMrkdwn(`hey <@u:${UUID}>`, {
        userLabel: () => "Matthias",
      })
    ).toBe("hey @Matthias");
  });

  it("leaves code spans untouched", () => {
    expect(markdownToMrkdwn("run `**not bold**` now **yes**")).toBe(
      "run `**not bold**` now *yes*"
    );
    expect(markdownToMrkdwn("```\n**raw**\n```")).toBe("```\n**raw**\n```");
  });
});

describe("mrkdwnToMarkdown", () => {
  it("maps mrkdwn back to markdown", () => {
    expect(
      mrkdwnToMarkdown("*bold* and _it_ and ~gone~ see <https://x.y/z|docs>")
    ).toBe("**bold** and *it* and ~~gone~~ see [docs](https://x.y/z)");
  });

  it("maps slack mentions via reverse map and label fallback", () => {
    expect(
      mrkdwnToMarkdown("hey <@U12345> <!channel>", {
        toEngentyUser: { U12345: UUID },
      })
    ).toBe(`hey <@u:${UUID}> <!channel>`);
    expect(
      mrkdwnToMarkdown("hey <@U777>", { slackUserLabel: () => "Max" })
    ).toBe("hey @Max");
  });

  it("unwraps bare links and decodes entities outside code", () => {
    expect(mrkdwnToMarkdown("go <https://a.b/c> &amp; enjoy")).toBe(
      "go https://a.b/c & enjoy"
    );
  });
});

describe("round trip", () => {
  it("keeps a typical message stable", () => {
    const original = "**Status**: done, see [board](https://x.y/b) `code *x*`";
    const there = markdownToMrkdwn(original);
    expect(mrkdwnToMarkdown(there)).toBe(original);
  });
});
