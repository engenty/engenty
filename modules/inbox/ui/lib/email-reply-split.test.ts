import { describe, expect, it } from "vitest";
import {
  asMarkdownBlockquote,
  splitQuotedEmailHtml,
  splitQuotedPlainText,
  stripTrailingMailChrome,
} from "../../src/lib/email-reply-split.js";

describe("splitQuotedEmailHtml", () => {
  it("splits on gmail_quote div", () => {
    const html = '<p>Hi</p><div class="gmail_quote">old</div>';
    const r = splitQuotedEmailHtml(html);
    expect(r.latest).toBe("<p>Hi</p>");
    expect(r.quoted).toBe('<div class="gmail_quote">old</div>');
  });

  it("splits on Outlook divRplyFwdMsg and keeps preceding hr with the quote", () => {
    const html = [
      "<p>Hi Matthias, bitte preload setzen. Liebe Grüße Valentin</p>",
      '<hr style="display: inline-block; width: 98%;">',
      '<div id="divRplyFwdMsg">',
      "<div><b>Von:</b> Dafir, Samy<br>",
      "<b>Gesendet:</b> Donnerstag, 30. Juli 2026 16:02</div>",
      "<div>Hi, das Audio Element…</div>",
      "</div>",
    ].join("");
    const r = splitQuotedEmailHtml(html);
    expect(r.latest).toContain("preload setzen");
    expect(r.latest).not.toContain("divRplyFwdMsg");
    expect(r.quoted).toMatch(/^<hr\b/i);
    expect(r.quoted).toContain("divRplyFwdMsg");
    expect(r.quoted).toContain("Dafir, Samy");
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

  it("splits on German Outlook Von/Gesendet after underscores", () => {
    const text = [
      "Hi Matthias,",
      "Bitte preload setzen.",
      "Liebe Grüße",
      "Valentin",
      "",
      "________________________________",
      "Von: Dafir, Samy <s.dafir@example.com>",
      "Gesendet: Donnerstag, 30. Juli 2026 16:02",
      "An: Todt, Valentin <v.todt@example.com>",
      "Betreff: AW: Erinnerungsbüro",
      "",
      "Hi,",
      "das Audio Element fehlt preload.",
    ].join("\n");
    const r = splitQuotedPlainText(text);
    expect(r.latest).toContain("Bitte preload setzen");
    expect(r.latest).not.toContain("Dafir");
    expect(r.quoted).toContain("Von: Dafir");
    expect(r.quoted).toContain("das Audio Element");
  });

  it("returns full text when no pattern", () => {
    const text = "Hello world";
    const r = splitQuotedPlainText(text);
    expect(r.latest).toBe("Hello world");
    expect(r.quoted).toBeNull();
  });
});

describe("stripTrailingMailChrome", () => {
  it("cuts at confidentiality disclaimers", () => {
    const text = [
      "Bitte noch machen. Vielen Dank!!",
      "Liebe Grüße Valentin",
      "",
      "This e-mail may contain confidential and/or privileged information.",
      "If you are not the intended recipient…",
    ].join("\n");
    expect(stripTrailingMailChrome(text)).toBe(
      "Bitte noch machen. Vielen Dank!!\nLiebe Grüße Valentin"
    );
  });

  it("cuts at underscore separators", () => {
    const text = "Body text here.\n\n________________________________\nVon: x";
    expect(stripTrailingMailChrome(text)).toBe("Body text here.");
  });

  it("cuts Outlook brand signature after Liebe Grüße + name", () => {
    const text = [
      "Könntest du das bitte noch machen.",
      "",
      "Vielen Dank!!",
      "",
      "Liebe Grüße",
      "",
      "Valentin",
      "",
      "S A L Z B U R G E R F E S T S P I E L E",
      "Valentin Todt",
      "Marketing",
      "",
      "v.todt@salzburgfestival.at",
      "T: +43 (662) 80458016",
      "",
      "Diese E-Mail enthält vertrauliche Informationen.",
      "This e-mail may contain confidential information.",
    ].join("\n");
    expect(stripTrailingMailChrome(text)).toBe(
      [
        "Könntest du das bitte noch machen.",
        "",
        "Vielen Dank!!",
        "",
        "Liebe Grüße",
        "",
        "Valentin",
      ].join("\n")
    );
  });
});

describe("asMarkdownBlockquote", () => {
  it("prefixes every line", () => {
    expect(asMarkdownBlockquote("a\nb\n\nc")).toBe("> a\n> b\n> \n> c");
  });
});
