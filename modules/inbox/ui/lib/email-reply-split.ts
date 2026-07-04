// Lifted from the legacy inbox module (proven against real Gmail/Outlook
// bodies) — deterministic, stateless splitters for quoted reply chains.

/** Split Gmail / common clients' quoted thread HTML from the latest reply. */
export function splitQuotedEmailHtml(html: string): {
  latest: string;
  quoted: string | null;
} {
  const gmailRe = /<div[^>]*\bclass=["'][^"']*\bgmail_quote\b[^"']*["'][^>]*>/i;
  const gmailMatch = gmailRe.exec(html);
  if (gmailMatch?.index != null) {
    return {
      latest: html.slice(0, gmailMatch.index),
      quoted: html.slice(gmailMatch.index),
    };
  }

  const outlookIdx = html.search(/<div[^>]*\bborder-top:\s*solid/i);
  if (outlookIdx !== -1) {
    return {
      latest: html.slice(0, outlookIdx),
      quoted: html.slice(outlookIdx),
    };
  }

  const bq = html.search(/<blockquote\b/i);
  if (bq !== -1) {
    return { latest: html.slice(0, bq), quoted: html.slice(bq) };
  }

  return { latest: html, quoted: null };
}

/** Split plain-text reply chains (Outlook / Apple / Gmail patterns). */
export function splitQuotedPlainText(text: string): {
  latest: string;
  quoted: string | null;
} {
  const patterns = [
    /\nOn .{5,200}?wrote:\s*\n/i,
    /\n-{2,}\s*Original Message\s*-{2,}\s*\n/i,
    /\nFrom:\s*.+\nSent:\s.+\n/i,
    /\nAm .{5,200}?schrieb .+:\s*\n/i,
  ];

  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.index != null && m.index > 24) {
      return {
        latest: text.slice(0, m.index).trim(),
        quoted: text.slice(m.index).trim(),
      };
    }
  }

  return { latest: text, quoted: null };
}
