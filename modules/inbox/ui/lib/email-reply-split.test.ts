import { describe, expect, it } from "vitest";
import {
  splitQuotedEmailHtml,
  splitQuotedPlainText,
} from "./email-reply-split.js";

describe("splitQuotedEmailHtml", () => {
  it("splits on gmail_quote div", () => {
    const html = '<p>Hi</p><div class="gmail_quote">old</div>';
    const r = splitQuotedEmailHtml(html);
    expect(r.latest).toBe("<p>Hi</p>");
    expect(r.quoted).toBe('<div class="gmail_quote">old</div>');
  });

  it("splits on blockquote", () => {
    const html = "<p>x</p><blockquote>q</blockquote>";
    const r = splitQuotedEmailHtml(html);
    expect(r.latest).toBe("<p>x</p>");
    expect(r.quoted).toBe("<blockquote>q</blockquote>");
  });

  it("returns full body when no quote marker", () => {
    const html = "<p>only</p>";
    const r = splitQuotedEmailHtml(html);
    expect(r.latest).toBe(html);
    expect(r.quoted).toBeNull();
  });
});

describe("splitQuotedPlainText", () => {
  it("splits on On … wrote:", () => {
    const text =
      "Thanks for your message — see below.\n\nOn Mon, x wrote:\n> old";
    const r = splitQuotedPlainText(text);
    expect(r.latest).toContain("Thanks for your message");
    expect(r.quoted).toContain("On Mon");
  });

  it("returns full text when no pattern", () => {
    const text = "Hello world";
    const r = splitQuotedPlainText(text);
    expect(r.latest).toBe("Hello world");
    expect(r.quoted).toBeNull();
  });
});
