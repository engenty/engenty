// The driver against a real Chromium (the machine's Chrome, headless) on a
// static page: the snapshot script runs for real, a covered target is not
// clicked, a stale page is refused, a fill types exactly the helper's text.
// Skips cleanly where no Chrome is installed (CI without a browser).
import { existsSync } from "node:fs";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FastLoopDriver, StalePageError } from "../driver.js";
import type { PageSnapshot } from "../snapshot.js";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];
const chromePath =
  process.env.ENGENTY_TEST_CHROME_PATH ??
  CHROME_PATHS.find((p) => existsSync(p));

const HTML = `<!doctype html><html><head><title>Fixture</title></head><body>
<h1>Book a trip</h1>
<form id="f">
  <label for="from">From</label><input id="from" type="text" value="">
  <label for="cabin">Cabin</label>
  <select id="cabin"><option value="economy" selected>Economy</option><option value="business">Business</option></select>
  <button type="button" id="go" onclick="document.getElementById('out').textContent='searched:'+document.getElementById('from').value+':'+document.getElementById('cabin').value">Search</button>
</form>
<button type="button" id="covered">Covered</button>
<div id="overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.01);display:none"></div>
<p id="out"></p>
</body></html>`;

describe.skipIf(!chromePath)("FastLoopDriver against real Chromium", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    const { chromium } = await import("playwright-core");
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
    });
    page = await browser.newPage({ viewport: { height: 800, width: 1200 } });
    await page.setContent(HTML);
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  const byLabel = (snap: PageSnapshot, label: string, kind: string) => {
    const action = snap.actions.find(
      (a) => a.label === label && a.kind === kind
    );
    if (!action) {
      throw new Error(
        `no ${kind} action labelled ${label}; got ${snap.actions.map((a) => `${a.kind}:${a.label}`).join(", ")}`
      );
    }
    return action;
  };

  it("observes visible controls with roles, labels, ids and a marker", async () => {
    const driver = new FastLoopDriver(page);
    const snap = await driver.observe();
    expect(snap.title).toBe("Fixture");
    expect(snap.text).toContain("Book a trip");
    expect(snap.actions.map((a) => a.id).slice(0, 3)).toEqual([
      "e1",
      "e2",
      "e3",
    ]);
    expect(byLabel(snap, "From", "fill").role).toBe("textbox");
    expect(byLabel(snap, "Cabin → Business", "select").value).toBe("business");
    expect(byLabel(snap, "Search", "click").role).toBe("button");
    expect(snap.actions.at(-1)?.id).toBe("wait");
    expect(Array.isArray(snap.marker)).toBe(true);
    expect(snap.fingerprint).toHaveLength(64);
  });

  it("fills exactly the given text, selects a value, clicks, and sees the change", async () => {
    const driver = new FastLoopDriver(page);
    let snap = await driver.observe();
    await driver.act(byLabel(snap, "From", "fill"), snap, "Zurich");
    snap = await driver.observe();
    expect(byLabel(snap, "From", "fill").value).toBe("Zurich");
    await driver.act(byLabel(snap, "Cabin → Business", "select"), snap);
    snap = await driver.observe();
    expect(snap.actions.some((a) => a.label === "Cabin → Economy")).toBe(true);
    await driver.act(byLabel(snap, "Search", "click"), snap);
    const after = await driver.observe();
    expect(after.text).toContain("searched:Zurich:business");
    expect(after.fingerprint).not.toBe(snap.fingerprint);
  });

  it("refuses to act on a snapshot the page has moved past", async () => {
    const driver = new FastLoopDriver(page);
    const snap = await driver.observe();
    // Text elsewhere moves the page marker (a DONE/BLOCKED decision is stale) …
    await page.evaluate(() => {
      document.getElementById("out")!.textContent = "changed";
    });
    expect(await driver.fresh(snap)).toBe(false);
    // … but a click is judged by its own element: unchanged, still fresh.
    expect(await driver.fresh(snap, byLabel(snap, "Search", "click"))).toBe(
      true
    );
    // The element itself changing is what refuses the click.
    await page.evaluate(() => {
      document.getElementById("go")!.textContent = "Go";
    });
    await expect(
      driver.act(byLabel(snap, "Search", "click"), snap)
    ).rejects.toBeInstanceOf(StalePageError);
    await page.evaluate(() => {
      document.getElementById("go")!.textContent = "Search";
    });
  });

  it("waits for a delayed re-render before the next observation", async () => {
    const driver = new FastLoopDriver(page);
    const snap = await driver.observe();
    const trigger = byLabel(snap, "Covered", "click");
    // A calendar-style page: the click starts a 300 ms transition and the
    // new control only appears when it ends — well past the two frames the
    // old settle allowed for.
    await page.evaluate(() => {
      document.querySelector('[data-late="1"]')?.remove();
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Covered"
      );
      button?.addEventListener(
        "click",
        () => {
          button.style.transition = "opacity 300ms linear";
          button.addEventListener(
            "transitionend",
            () => {
              const late = document.createElement("button");
              late.textContent = "Late";
              late.dataset.late = "1";
              document.body.append(late);
            },
            { once: true }
          );
          requestAnimationFrame(() => {
            button.style.opacity = "0.5";
          });
        },
        { once: true }
      );
    });
    await driver.act(trigger, snap);
    const after = await driver.observe();
    expect(after.actions.some((a) => a.label === "Late")).toBe(true);
  });

  it("does not click a target another element covers", async () => {
    const driver = new FastLoopDriver(page);
    const snap = await driver.observe();
    const covered = byLabel(snap, "Covered", "click");
    await page.evaluate(() => {
      document.getElementById("overlay")!.style.display = "block";
    });
    // The overlay is invisible to the marker (no text, no control) — only the hit test catches it.
    await expect(driver.act(covered, snap)).rejects.toThrow(/covered/);
    await page.evaluate(() => {
      document.getElementById("overlay")!.style.display = "none";
    });
  });
});
