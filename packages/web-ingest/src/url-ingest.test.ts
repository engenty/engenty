import { afterEach, describe, expect, it, vi } from "vitest";
import { ingestUrlToMarkdown, UrlIngest } from "./url-ingest.js";

describe("UrlIngest / ingestUrlToMarkdown", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses fetch adapter when strategy is fetch", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "secret");
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("<html><body><p>ok</p></body></html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
        status: 200,
      })
    );
    const ingest = new UrlIngest();
    const r = await ingest.ingestUrl("https://example.com/page", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      strategy: "fetch",
    });
    expect(r.provider).toBe("fetch");
    expect(r.markdown).toContain("ok");
    expect(r.raw_html).toContain("<p>ok</p>");
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("applies default HTML excludes in fetch adapter", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        `<html><body>
          <main><p>Article text</p></main>
          <div class="BorlabsCookie">Ich stimme allen Cookies zu</div>
        </body></html>`,
        {
          headers: { "content-type": "text/html; charset=utf-8" },
          status: 200,
        }
      )
    );

    const ingest = new UrlIngest();
    const r = await ingest.ingestUrl("https://example.com/page", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      strategy: "fetch",
    });

    expect(r.markdown).toContain("Article text");
    expect(r.markdown).not.toContain("Ich stimme allen Cookies zu");
    expect(r.raw_html).toContain("BorlabsCookie");
    expect(r.sections?.map((section) => section.locator)).toEqual([
      "raw_html",
      "clean_html",
      "markdown",
    ]);
  });

  it("extracts media and links from cleaned HTML", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        `<html><body>
          <main>
            <figure>
              <img src="/img/hero.png" alt="Hero" width="640" height="320" />
              <figcaption>Hero caption</figcaption>
            </figure>
            <a href="/internal">Internal page</a>
            <a href="https://other.test/page">External page</a>
            <a href="/files/guide.pdf">Guide PDF</a>
          </main>
          <aside><img src="/ad.png" alt="Ad" /></aside>
        </body></html>`,
        {
          headers: { "content-type": "text/html; charset=utf-8" },
          status: 200,
        }
      )
    );

    const ingest = new UrlIngest();
    const r = await ingest.ingestUrl("https://example.com/page", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      htmlExtract: { includeSelectors: ["main"] },
      strategy: "fetch",
    });

    expect(r.media?.map((item) => item.source_url)).toContain(
      "https://example.com/img/hero.png"
    );
    expect(r.media?.some((item) => item.source_url.endsWith("/ad.png"))).toBe(
      false
    );
    expect(
      r.media?.find((item) => item.media_type === "document")
    ).toMatchObject({
      content_type: "application/pdf",
      source_url: "https://example.com/files/guide.pdf",
    });
    expect(r.links?.map((link) => link.link_type)).toEqual([
      "internal",
      "external",
      "asset",
    ]);
  });

  it("strips Borlabs markdown leftovers in fetch adapter", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        `<html><body>
          <main>
            <h1>Article</h1>
            <p>Article text</p>
            <p>Datenschutzeinstellungen</p>
            <p>Notwendige Cookies (3)</p>
            <p>Cookie-Informationen anzeigen</p>
            <p>| Name | Borlabs Cookie |</p>
            <p>| Cookie Name | borlabs-cookie, borlabs-dialog |</p>
          </main>
        </body></html>`,
        {
          headers: { "content-type": "text/html; charset=utf-8" },
          status: 200,
        }
      )
    );

    const ingest = new UrlIngest();
    const r = await ingest.ingestUrl("https://example.com/page", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      strategy: "fetch",
    });

    expect(r.markdown).toContain("Article text");
    expect(r.markdown).not.toContain("Datenschutzeinstellungen");
    expect(r.markdown).not.toContain("Borlabs Cookie");
    expect(r.markdown).not.toContain("borlabs-dialog");
  });

  it("uses Firecrawl adapter when strategy is firecrawl", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            html: "<html><body><h1>Hi</h1></body></html>",
            markdown: "# Hi\n\n[Ich stimme allen Cookies zu](#)",
            metadata: { sourceURL: "https://x.com" },
          },
          success: true,
        }),
        { headers: { "content-type": "application/json" }, status: 200 }
      )
    );
    const ingest = new UrlIngest();
    const r = await ingest.ingestUrl("https://example.com/", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      firecrawlApiKey: "k",
      strategy: "firecrawl",
    });
    expect(r.provider).toBe("firecrawl");
    expect(r.markdown).toContain("# Hi");
    expect(r.markdown).not.toContain("Ich stimme allen Cookies zu");
    expect(r.raw_html).toContain("<h1>Hi</h1>");
    const call = fetchImpl.mock.calls[0];
    expect(String(call?.[0])).toContain("/scrape");
    const init = call?.[1] as RequestInit;
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      excludeTags: expect.arrayContaining(["#BorlabsCookieBox"]),
      formats: ["markdown", "html"],
    });
  });

  it("ingestUrlToMarkdown default export uses facade", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("<html><body>x</body></html>", {
        headers: { "content-type": "text/html" },
        status: 200,
      })
    );
    const r = await ingestUrlToMarkdown("https://example.com/z", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      strategy: "fetch",
    });
    expect(r.markdown).toContain("x");
  });

  it("lists adapters by priority", () => {
    const ingest = new UrlIngest();
    const list = ingest.listAdapters();
    expect(list.map((x) => x.id)).toEqual(["firecrawl", "fetch"]);
  });
});
