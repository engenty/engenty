import { describe, expect, it } from "vitest";

import { stripCookieConsentFromMarkdown } from "./markdown-strip-cookie-consent.js";

describe("stripCookieConsentFromMarkdown", () => {
  it("removes common German cookie consent markdown while keeping article text", () => {
    const markdown = `# Weiterbildungsangebot

Die eigentliche Seite beschreibt Förderung und Kurse.

- Externe Medien
- Statistiken
- Marketing

[Ich stimme allen Cookies zu](#)
[Notwendige Cookies akzeptieren](#)
[Cookie Details](#)
[Cookie-Details Datenschutzerklärung Impressum](#)

Datenschutzeinstellungen

Hier finden Sie eine Übersicht über alle verwendeten Cookies.

[Ich stimme allen Cookies zu](#) [Auswahl speichern](#)

| Name | Borlabs Cookie |
| Anbieter | Eigentümer dieser Website |
`;

    const out = stripCookieConsentFromMarkdown(markdown);

    expect(out).toContain(
      "Die eigentliche Seite beschreibt Förderung und Kurse."
    );
    expect(out).not.toContain("Ich stimme allen Cookies zu");
    expect(out).not.toContain("Datenschutzeinstellungen");
    expect(out).not.toContain("Marketing");
    expect(out).not.toContain("Borlabs Cookie");
  });

  it("removes expanded Borlabs preference details", () => {
    const markdown = `# Beruf und Weiterbildung

Die eigentliche Seite bleibt erhalten.

Einstellungen bestätigen Sie indem Sie diese speichern.

[Ich stimme allen Cookies zu](#) [Auswahl speichern](#) [Notwendige Cookies akzeptieren](#)

Zurück

Datenschutzeinstellungen

Notwendige Cookies (3)

Notwendige Cookies ermöglichen grundlegende Funktionen und sind für die einwandfreie Funktion erforderlich.

Cookie-Informationen anzeigen

Cookie-Informationen ausblenden

| Name | Borlabs Cookie |
| Anbieter | Eigentümer dieser Website., [Impressum](#) |
| Zweck | Speichert die Einstellungen der Besucher, die in der Cookie Box von Borlabs Cookie ausgewählt wurden. |
| Datenschutzerklärung | https://www.waff.at/datenschutzhinweis/ |
| Cookie Name | borlabs-cookie, borlabs-dialog |
| Cookie Laufzeit | 1 Jahr |

| Name | Polylang Sprachpräferenz |
| Anbieter | WAFF |
| Zweck | Speichert die aktuell gewählte Sprachpräferenz. |
| Cookie Name | pll_language |
| Cookie Laufzeit | 1 Jahr |`;

    const out = stripCookieConsentFromMarkdown(markdown);

    expect(out).toContain("Die eigentliche Seite bleibt erhalten.");
    expect(out).not.toContain("Ich stimme allen Cookies zu");
    expect(out).not.toContain("Datenschutzeinstellungen");
    expect(out).not.toContain("Notwendige Cookies");
    expect(out).not.toContain("Borlabs Cookie");
    expect(out).not.toContain("Polylang Sprachpräferenz");
    expect(out).not.toContain("pll_language");
  });

  it("leaves ordinary markdown unchanged when no cookie signature exists", () => {
    const markdown = "- Marketing\n\nThis page explains campaign work.";
    expect(stripCookieConsentFromMarkdown(markdown)).toBe(markdown);
  });
});
