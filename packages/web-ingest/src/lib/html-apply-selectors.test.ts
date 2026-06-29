import { describe, expect, it } from "vitest";

import { applyHtmlExtractSelectors } from "./html-apply-selectors.js";

describe("applyHtmlExtractSelectors", () => {
  it("removes nav and footer via defaults", () => {
    const html = `<!DOCTYPE html><html><body>
      <nav><a href="/">Home</a></nav>
      <main><p>Article body</p></main>
      <footer>Legal</footer>
    </body></html>`;
    const out = applyHtmlExtractSelectors(html, {});
    expect(out).toContain("Article body");
    expect(out).not.toContain("Home");
    expect(out).not.toContain("Legal");
  });

  it("respects skipDefaultExcludeSelectors", () => {
    const html = `<!DOCTYPE html><html><body>
      <nav>Keep me</nav>
      <p>Hi</p>
    </body></html>`;
    const out = applyHtmlExtractSelectors(html, {
      skipDefaultExcludeSelectors: true,
    });
    expect(out).toContain("Keep me");
  });

  it("applies includeSelectors to keep only main", () => {
    const html = `<!DOCTYPE html><html><body>
      <header>Title</header>
      <main><p>Core</p></main>
    </body></html>`;
    const out = applyHtmlExtractSelectors(html, {
      skipDefaultExcludeSelectors: true,
      includeSelectors: ["main"],
    });
    expect(out).toContain("Core");
    expect(out).not.toContain("Title");
  });

  it("merges custom excludeSelectors with defaults", () => {
    const html = `<!DOCTYPE html><html><body>
      <div class="promo-box">Promo</div>
      <p>Text</p>
    </body></html>`;
    const out = applyHtmlExtractSelectors(html, {
      excludeSelectors: [".promo-box"],
    });
    expect(out).toContain("Text");
    expect(out).not.toContain("Promo");
  });

  it("removes common cookie consent dialogs via defaults", () => {
    const html = `<!DOCTYPE html><html><body>
      <main><p>Funding and training article</p></main>
      <section id="BorlabsCookieBox">
        <a>Ich stimme allen Cookies zu</a>
        <a>Notwendige Cookies akzeptieren</a>
        <h2>Datenschutzeinstellungen</h2>
        <p>Marketing</p>
      </section>
      <div class="cookie-consent-banner">Accept all cookies</div>
    </body></html>`;
    const out = applyHtmlExtractSelectors(html, {});
    expect(out).toContain("Funding and training article");
    expect(out).not.toContain("Ich stimme allen Cookies zu");
    expect(out).not.toContain("Datenschutzeinstellungen");
    expect(out).not.toContain("Accept all cookies");
  });

  it("removes Borlabs variants via default selectors", () => {
    const html = `<!DOCTYPE html><html><body>
      <main><p>Funding and training article</p></main>
      <div class="_brlbs-box">Cookie-Informationen anzeigen</div>
      <div data-borlabs-cookie>Datenschutzeinstellungen</div>
      <div id="BorlabsCookieWidget">Borlabs Cookie</div>
    </body></html>`;
    const out = applyHtmlExtractSelectors(html, {});
    expect(out).toContain("Funding and training article");
    expect(out).not.toContain("Cookie-Informationen anzeigen");
    expect(out).not.toContain("Datenschutzeinstellungen");
    expect(out).not.toContain("Borlabs Cookie");
  });

  it("removes search regions via defaults", () => {
    const html = `<!DOCTYPE html><html><body>
      <main><p>Funding and training article</p></main>
      <div class="en-search" role="search">
        <label>Suchen nach</label>
        <input value="Suche" />
      </div>
    </body></html>`;
    const out = applyHtmlExtractSelectors(html, {});
    expect(out).toContain("Funding and training article");
    expect(out).not.toContain("Suchen nach");
    expect(out).not.toContain("Suche");
  });
});
