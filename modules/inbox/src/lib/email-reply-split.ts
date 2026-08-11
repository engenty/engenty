// Lifted from the legacy inbox module (proven against real Gmail/Outlook
// bodies) — deterministic, stateless splitters for quoted reply chains.

export interface EmailQuoteSplit {
  latest: string;
  quoted: string | null;
}

/**
 * Outlook often inserts `<hr>` immediately before `#divRplyFwdMsg`. Prefer
 * cutting at the hr so the rule stays with the quoted block.
 */
function cutAtOutlookReplyForward(
  html: string,
  markerIndex: number
): EmailQuoteSplit {
  const before = html.slice(0, markerIndex);
  const hrMatch = /<hr\b[^>]*>\s*$/i.exec(before);
  const cut = hrMatch?.index ?? markerIndex;
  return {
    latest: html.slice(0, cut),
    quoted: html.slice(cut),
  };
}

/** Split Gmail / Outlook / common clients' quoted thread HTML from the latest reply. */
export function splitQuotedEmailHtml(html: string): EmailQuoteSplit {
  const gmailRe = /<div[^>]*\bclass=["'][^"']*\bgmail_quote\b[^"']*["'][^>]*>/i;
  const gmailMatch = gmailRe.exec(html);
  if (gmailMatch?.index != null) {
    return {
      latest: html.slice(0, gmailMatch.index),
      quoted: html.slice(gmailMatch.index),
    };
  }

  // Outlook desktop / OWA reply+forward wrapper (DE/EN). More reliable than
  // border-top heuristics — many tenants never emit that style.
  const outlookRply = html.search(/<div[^>]*\bid=["']divRplyFwdMsg["'][^>]*>/i);
  if (outlookRply !== -1) {
    return cutAtOutlookReplyForward(html, outlookRply);
  }

  const outlookIdx = html.search(/<div[^>]*\bborder-top:\s*solid/i);
  if (outlookIdx !== -1) {
    return {
      latest: html.slice(0, outlookIdx),
      quoted: html.slice(outlookIdx),
    };
  }

  // Bare Outlook header block without divRplyFwdMsg (some mobile clients).
  const outlookHeaders = html.search(
    /<(?:b|strong)\s*>\s*(?:Von|From)\s*:\s*<\/(?:b|strong)\s*>/i
  );
  if (outlookHeaders > 80) {
    return cutAtOutlookReplyForward(html, outlookHeaders);
  }

  const bq = html.search(/<blockquote\b/i);
  if (bq !== -1) {
    return { latest: html.slice(0, bq), quoted: html.slice(bq) };
  }

  return { latest: html, quoted: null };
}

/** Split plain-text reply chains (Outlook / Apple / Gmail patterns). */
export function splitQuotedPlainText(text: string): EmailQuoteSplit {
  const patterns = [
    /\nOn .{5,200}?wrote:\s*\n/i,
    /\n-{2,}\s*Original Message\s*-{2,}\s*\n/i,
    /\n_{5,}\s*\r?\nVon:\s.+\r?\nGesendet:\s.+\r?\n/i,
    /\n_{5,}\s*\r?\nFrom:\s.+\r?\nSent:\s.+\r?\n/i,
    /\nVon:\s.+\r?\nGesendet:\s.+\r?\n(?:An|Cc|Betreff):/i,
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

/**
 * Drop trailing signature / legal chrome that survived quote splitting.
 *
 * Order matters: corporate signatures usually sit *before* the confidentiality
 * notice, so cutting only at the disclaimer leaves the whole brand block. We
 * therefore also cut after a sign-off (+ short name) and at spaced-capital
 * brand lines ("S A L Z B U R G E R …").
 */
export function stripTrailingMailChrome(text: string): string {
  let result = text;

  const hardMarkers: RegExp[] = [
    /\n_{5,}\s*(?:\r?\n|$)/,
    /\n(?:This e-mail may contain confidential|Diese (?:E-?Mail|Nachricht)[^\n]{0,80}(?:vertraulich|Vertraulich))/i,
    /\n(?:CONFIDENTIALITY NOTICE|HINWEIS ZUR VERTRAULICHKEIT)\b/i,
    // Spaced brand typography common in Outlook HTML signatures.
    /\n[A-ZÄÖÜ](?:[ \t]+[A-ZÄÖÜ]){5,}[ \t]*(?:\n|$)/,
    /\nUID\s*ATU\d+/i,
    /\nDVR\s*\d+/i,
  ];

  let cut = result.length;
  for (const re of hardMarkers) {
    const match = re.exec(result);
    if (
      match?.index != null &&
      result.slice(0, match.index).trim().length >= 12 &&
      match.index < cut
    ) {
      cut = match.index;
    }
  }
  result = result.slice(0, cut).trimEnd();

  return stripAfterSignOff(result);
}

const SIGN_OFF_RE =
  /(?:^|\n)(?:(?:Viele|Liebe|Beste|Herzliche)\s+Gr(?:ü|u)(?:ß|ss)e|Mit\s+freundlichen\s+Gr(?:ü|u)(?:ß|ss)en|Best\s+regards|Kind\s+regards|Warm\s+regards|Vielen\s+Dank[!]*|Thanks(?:\s+a\s+lot)?[!]*|Thank\s+you[!]*|Cheers|VG|LG|MfG)\s*[,!]?\s*(?:\n|$)/gi;

function looksLikeSignatureLine(line: string): boolean {
  const t = line.trim();
  if (!t) {
    return false;
  }
  if (/^(UID|DVR|Sitz|T:|Tel\.?|Fax|Marketing|www\.|https?:)/i.test(t)) {
    return true;
  }
  if (/^[A-ZÄÖÜ](?:[ \t]+[A-ZÄÖÜ]){4,}$/.test(t)) {
    return true;
  }
  if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Keep the sign-off and at most two short name lines; drop the brand / address
 * / social / legal block that typically follows.
 */
function stripAfterSignOff(text: string): string {
  SIGN_OFF_RE.lastIndex = 0;
  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null = SIGN_OFF_RE.exec(text);
  while (match) {
    last = match;
    match = SIGN_OFF_RE.exec(text);
  }
  if (!last) {
    return text;
  }

  const afterIdx = last.index + last[0].length;
  const after = text.slice(afterIdx);
  const lines = after.split(/\n/);
  let keepLines = 0;
  let consumed = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      consumed += line.length + 1;
      continue;
    }
    if (
      keepLines < 2 &&
      trimmed.length <= 48 &&
      !looksLikeSignatureLine(trimmed)
    ) {
      keepLines += 1;
      consumed += line.length + 1;
      continue;
    }
    break;
  }

  const leftover = after.slice(consumed).trim();
  // Only cut when a real signature block follows (not a short PS).
  if (leftover.length < 40) {
    return text;
  }
  if (
    !(
      looksLikeSignatureLine(
        leftover.split(/\n/).find((l) => l.trim()) ?? ""
      ) ||
      /\b(?:UID|DVR|Marketing|Hofstall|Austria|Youtube|Instagram|Facebook|LinkedIn|vertraulich|confidential)\b/i.test(
        leftover
      ) ||
      /[A-ZÄÖÜ](?:[ \t]+[A-ZÄÖÜ]){5,}/.test(leftover)
    )
  ) {
    return text;
  }

  return text.slice(0, afterIdx + consumed).trimEnd();
}

/**
 * Same idea for HTML latest-parts: cut at a confidentiality notice so the
 * Original view does not keep a page of legal boilerplate under the reply.
 */
export function stripTrailingHtmlChrome(html: string): string {
  const markers: RegExp[] = [
    /This e-mail may contain confidential/i,
    /Diese E-?Mails?[^\n<]{0,120}vertraulich/i,
    /CONFIDENTIALITY NOTICE/i,
    /HINWEIS ZUR VERTRAULICHKEIT/i,
    // Spaced brand block (Outlook HTML signatures).
    /S(?:\s|&nbsp;)+A(?:\s|&nbsp;)+L(?:\s|&nbsp;)+Z(?:\s|&nbsp;)+B(?:\s|&nbsp;)+U(?:\s|&nbsp;)+R(?:\s|&nbsp;)+G(?:\s|&nbsp;)+E(?:\s|&nbsp;)+R/i,
    /\bUID\s*ATU\d+/i,
  ];
  let cut = html.length;
  for (const re of markers) {
    const match = re.exec(html);
    if (match?.index != null && match.index > 120 && match.index < cut) {
      cut = match.index;
    }
  }
  if (cut === html.length) {
    return html;
  }
  // Prefer cutting at a block boundary just before the chrome when present.
  const before = html.slice(0, cut);
  const blockBreak = Math.max(
    before.lastIndexOf("</div>"),
    before.lastIndexOf("</p>"),
    before.lastIndexOf("<br")
  );
  if (blockBreak > 120) {
    const afterBreak = before.indexOf(">", blockBreak);
    return html.slice(0, afterBreak === -1 ? blockBreak : afterBreak + 1);
  }
  return before;
}

/** Wrap forwarded / quoted markdown as a blockquote block. */
export function asMarkdownBlockquote(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}
