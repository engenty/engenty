const COOKIE_SIGNATURE_PATTERN =
  /(\bborlabs\b|\bcookiebot\b|\bonetrust\b|\bcomplianz\b|ich stimme allen cookies zu|notwendige cookies akzeptieren|cookie[-\s]?details?|cookie-informationen|datenschutzeinstellungen|accept all cookies|necessary cookies|cookie settings|privacy settings)/i;

const COOKIE_LINE_PATTERNS: RegExp[] = [
  /\bborlabs\b/i,
  /\bcookiebot\b/i,
  /\bonetrust\b/i,
  /\bcomplianz\b/i,
  /ich stimme allen cookies zu/i,
  /notwendige cookies akzeptieren/i,
  /cookie[-\s]?details?/i,
  /cookie-informationen/i,
  /cookie[-\s]?datenschutz/i,
  /datenschutzeinstellungen/i,
  /auswahl speichern/i,
  /zurück/i,
  /hier finden sie eine übersicht über alle verwendeten cookies/i,
  /detaillierte informationen zu einzelnen cookies/i,
  /einstellungen bestätigen sie/i,
  /cookies ermöglichen grundlegende funktionen/i,
  /notwendige cookies ermöglichen/i,
  /cookie-informationen (anzeigen|ausblenden)/i,
  /session cookies/i,
  /accept all cookies/i,
  /necessary cookies/i,
  /cookie settings/i,
  /privacy settings/i,
  /\|\s*name\s*\|.*cookie/i,
  /\|\s*anbieter\s*\|/i,
  /\|\s*provider\s*\|/i,
  /\|\s*zweck\s*\|/i,
  /\|\s*datenschutzerklärung\s*\|/i,
  /\|\s*cookie name\s*\|/i,
  /\|\s*cookie laufzeit\s*\|/i,
];

const COOKIE_CATEGORY_LINE_PATTERN =
  /^\s*[-*]\s*(notwendige cookies|externe medien|statistiken|marketing|necessary cookies|external media|statistics)\s*$/i;

const COOKIE_DETAIL_BLOCK_START_PATTERN =
  /(datenschutzeinstellungen|notwendige cookies\s*\(\d+\)|cookie-informationen anzeigen|cookie-informationen ausblenden|privacy settings|necessary cookies\s*\(\d+\))/i;

const MARKDOWN_HEADING_PATTERN = /^#{1,3}\s+\S/;

export function stripCookieConsentFromMarkdown(markdown: string): string {
  if (!COOKIE_SIGNATURE_PATTERN.test(markdown)) {
    return markdown;
  }

  const lines = markdown.split(/\r?\n/);
  let inCookieDetailBlock = false;
  const kept = lines.filter((line) => {
    const text = line.trim();
    if (!text) {
      return true;
    }
    if (
      inCookieDetailBlock &&
      MARKDOWN_HEADING_PATTERN.test(text) &&
      !COOKIE_SIGNATURE_PATTERN.test(text) &&
      !COOKIE_CATEGORY_LINE_PATTERN.test(text)
    ) {
      inCookieDetailBlock = false;
    }
    if (inCookieDetailBlock) {
      return false;
    }
    if (COOKIE_DETAIL_BLOCK_START_PATTERN.test(text)) {
      inCookieDetailBlock = true;
      return false;
    }
    if (COOKIE_CATEGORY_LINE_PATTERN.test(text)) {
      return false;
    }
    return !COOKIE_LINE_PATTERNS.some((pattern) => pattern.test(text));
  });

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
