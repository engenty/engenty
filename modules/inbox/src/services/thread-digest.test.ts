import { describe, expect, it } from "vitest";
import { isLikelyDecorationAttachment } from "../lib/attachment-decoration.js";
import {
  isUselessDigestContent,
  normalizeDigestMarkdown,
  shouldFallbackToExtractedBody,
  unescapeDigestEscapes,
} from "../lib/digest-markdown.js";
import type { InboxAttachmentMeta, InboxMessage } from "../schema/types.js";
import {
  coerceMessageDigestOutput,
  dominantCategory,
  extractLatestBodyText,
  htmlToPromptMarkdown,
  parseJsonFromModelText,
} from "./thread-digest.js";

function makeAttachment(
  overrides: Partial<InboxAttachmentMeta> = {}
): InboxAttachmentMeta {
  return {
    attachment_id: "att-1",
    content_id: null,
    filename: "report.pdf",
    mime_type: "application/pdf",
    size: 120_000,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    ai_category: null,
    attachments_json: [],
    body_html: null,
    body_text: null,
    cc_emails: [],
    classification: null,
    classification_reason: null,
    connection_id: "conn-1",
    created_at: "2026-07-22T10:00:00Z",
    from_email: "a@example.com",
    from_name: "A",
    has_attachments: false,
    id: "msg-1",
    owner_user_id: null,
    provider_message_id: "prov-1",
    provider_thread_id: null,
    received_at: null,
    scope_id: "default",
    snippet: null,
    status: "new",
    status_set_by: null,
    subject: "Test",
    tenant_id: "tenant-1",
    thread_id: "thread-1",
    to_emails: [],
    updated_at: "2026-07-22T10:00:00Z",
    user_classification: null,
    ...overrides,
  };
}

describe("isLikelyDecorationAttachment", () => {
  it("drops small inline images (signature logos, social icons)", () => {
    const socialIcon = makeAttachment({
      content_id: "<face_d056d1db.png>",
      filename: "face_d056d1db.png",
      mime_type: "image/png",
      size: 2115,
    });
    expect(isLikelyDecorationAttachment(socialIcon)).toBe(true);
  });

  it("drops small generated-name images even when not inline", () => {
    const attachment = makeAttachment({
      filename: "image001.png",
      mime_type: "image/png",
      size: 10_000,
    });
    expect(isLikelyDecorationAttachment(attachment)).toBe(true);
  });

  it("keeps inline screenshots, which are far larger than decoration", () => {
    const screenshot = makeAttachment({
      content_id: "<ii_19f3bcf3>",
      filename: "image.png",
      mime_type: "image/png",
      size: 168_750,
    });
    expect(isLikelyDecorationAttachment(screenshot)).toBe(false);
  });

  it("keeps real documents and large images", () => {
    expect(isLikelyDecorationAttachment(makeAttachment())).toBe(false);
    const photo = makeAttachment({
      filename: "site-photo.jpg",
      mime_type: "image/jpeg",
      size: 2_400_000,
    });
    expect(isLikelyDecorationAttachment(photo)).toBe(false);
  });

  it("drops social / QR filenames even without a content_id", () => {
    expect(
      isLikelyDecorationAttachment(
        makeAttachment({
          content_id: null,
          filename: "you_9e0ce020.png",
          mime_type: "image/png",
          size: 2941,
        })
      )
    ).toBe(true);
    expect(
      isLikelyDecorationAttachment(
        makeAttachment({
          content_id: null,
          filename: "QR551c05de.png",
          mime_type: "image/png",
          size: 3368,
        })
      )
    ).toBe(true);
  });
});

describe("extractLatestBodyText", () => {
  it("keeps only the latest reply — drops in-thread gmail quotes", () => {
    const message = makeMessage({
      body_html:
        '<div><p>Please check the <a href="https://example.com/page">page</a>.</p></div>' +
        '<div class="gmail_quote">On Tue, someone wrote: old stuff</div>',
      subject: "Re: page",
    });
    const text = extractLatestBodyText(message);
    expect(text).toContain("Please check the");
    expect(text).toContain("https://example.com/page");
    expect(text).not.toContain("old stuff");
  });

  it("drops plain-text quoted reply history in a thread", () => {
    const message = makeMessage({
      body_text:
        "Danke, das passt so — wir melden uns nächste Woche.\n\nAm 21.07.2026 um 09:00 schrieb Valentin Todt:\n> alte Nachricht",
      subject: "AW: Erinnerungsbüro",
    });
    expect(extractLatestBodyText(message)).toBe(
      "Danke, das passt so — wir melden uns nächste Woche."
    );
  });

  it("keeps forwarded bodies as blockquotes on WG:/FW: subjects", () => {
    const message = makeMessage({
      body_html: [
        "<p>Bitte siehe unten.</p>",
        '<hr><div id="divRplyFwdMsg"><b>Von:</b> Samy<br>Hi, preload setzen.</div>',
      ].join(""),
      subject: "WG: Erinnerungsbüro Seite + iPads",
    });
    const text = extractLatestBodyText(message);
    expect(text).toContain("Bitte siehe unten");
    expect(text).toContain("> ");
    expect(text).toContain("preload setzen");
  });
});

describe("htmlToPromptMarkdown", () => {
  it("keeps headings, bold, and bullet lists", () => {
    const markdown = htmlToPromptMarkdown(
      "<p>Hi Matthias,</p><p><b>Baukästen:</b></p><ul><li>Erster Punkt</li><li>Zweiter Punkt</li></ul><h3>Archiv</h3><p>Nachtrag</p>"
    );
    expect(markdown).toContain("**Baukästen:**");
    expect(markdown).toContain("- Erster Punkt");
    expect(markdown).toContain("- Zweiter Punkt");
    expect(markdown).toContain("### Archiv");
  });

  it("emits markdown links but leaves bare URLs alone", () => {
    const linked = htmlToPromptMarkdown(
      '<a href="https://example.com/page">the page</a>'
    );
    expect(linked.trim()).toBe("[the page](https://example.com/page)");

    const bare = htmlToPromptMarkdown(
      '<a href="https://example.com/x">https://example.com/x</a>'
    );
    expect(bare.trim()).toBe("https://example.com/x");
  });

  it("keeps numbered lists as ordered markdown", () => {
    const markdown = htmlToPromptMarkdown(
      "<ol><li><p>First</p></li><li><p>Second</p></li></ol>"
    );
    expect(markdown).toContain("1. First");
    expect(markdown).toContain("2. Second");
  });
});

describe("dominantCategory", () => {
  it("treats any human message as making the thread a conversation", () => {
    expect(dominantCategory(["newsletter", "conversation"])).toBe(
      "conversation"
    );
  });

  it("otherwise picks the most frequent category", () => {
    expect(dominantCategory(["promotion", "spam", "promotion"])).toBe(
      "promotion"
    );
  });

  it("defaults to conversation when there is nothing to go on", () => {
    expect(dominantCategory([])).toBe("conversation");
  });
});

describe("normalizeDigestMarkdown", () => {
  it("pulls bullet text back onto its marker line", () => {
    expect(
      normalizeDigestMarkdown(
        "- \nKonzertproduktionen ab 2005\n\n- \nURL-Punkte"
      )
    ).toBe("- Konzertproduktionen ab 2005\n\n- URL-Punkte");
  });

  it("leaves well-formed lists untouched", () => {
    const good = "- Erster Punkt\n- Zweiter Punkt";
    expect(normalizeDigestMarkdown(good)).toBe(good);
  });

  it('turns literal \\n / \\" artifacts into real newlines and quotes', () => {
    expect(
      normalizeDigestMarkdown(
        'Auf TDS war preload <audio preload =\\" metadata \\">\\ngesetzt\\n\\npreload=\\"none\\"'
      )
    ).toBe(
      'Auf TDS war preload <audio preload =" metadata ">\ngesetzt\n\npreload="none"'
    );
  });
});

describe("isUselessDigestContent / shouldFallbackToExtractedBody", () => {
  it("treats ellipsis stubs as useless", () => {
    expect(isUselessDigestContent("...")).toBe(true);
    expect(isUselessDigestContent("…")).toBe(true);
    expect(isUselessDigestContent("")).toBe(true);
    expect(isUselessDigestContent("Hi Matthias, bitte preload setzen.")).toBe(
      false
    );
  });

  it("falls back when the model collapsed a long body to a stub", () => {
    const body = "x".repeat(200);
    expect(shouldFallbackToExtractedBody("...", body)).toBe(true);
    expect(shouldFallbackToExtractedBody("ok", body)).toBe(true);
    expect(
      shouldFallbackToExtractedBody("Bitte preload none setzen. Danke!", body)
    ).toBe(false);
  });
});

describe("parseJsonFromModelText", () => {
  it("parses bare JSON and fenced blocks", () => {
    expect(parseJsonFromModelText('{"a":1}')).toEqual({ a: 1 });
    expect(
      parseJsonFromModelText('Here you go:\n```json\n{"body":"hi"}\n```')
    ).toEqual({ body: "hi" });
  });
});

describe("unescapeDigestEscapes", () => {
  it("is a no-op when there are no escape sequences", () => {
    expect(unescapeDigestEscapes("hello\nworld")).toBe("hello\nworld");
  });
});

describe("htmlToPromptMarkdown list items", () => {
  it("keeps a bullet and its text together when the item wraps a block tag", () => {
    const markdown = htmlToPromptMarkdown(
      "<ul><li><p>Konzertproduktionen ab 2005 ist zerschossen</p></li><li><p>URL-Punkte</p></li></ul>"
    );
    expect(markdown).toBe(
      "- Konzertproduktionen ab 2005 ist zerschossen\n- URL-Punkte"
    );
  });
});

describe("coerceMessageDigestOutput", () => {
  it("accepts the body/classification aliases small models emit", () => {
    expect(
      coerceMessageDigestOutput({
        body: "kannst du mir bitte ein Angebot schicken?",
        classification: "conversation",
      })
    ).toEqual({
      category: "conversation",
      content_markdown: "kannst du mir bitte ein Angebot schicken?",
      keep_attachment_indexes: [],
    });
  });

  it("keeps the strict schema shape unchanged", () => {
    expect(
      coerceMessageDigestOutput({
        category: "newsletter",
        content_markdown: "## Update",
        keep_attachment_indexes: [0, 2],
      })
    ).toEqual({
      category: "newsletter",
      content_markdown: "## Update",
      keep_attachment_indexes: [0, 2],
    });
  });

  it("returns null when no body content is present", () => {
    expect(coerceMessageDigestOutput({ classification: "spam" })).toBeNull();
    expect(coerceMessageDigestOutput(null)).toBeNull();
  });
});
