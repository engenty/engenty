/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { contentMain } from "./content-main.js";

const REGISTRY_KEY = "__engentyBridgeRegistry";

interface Registry {
  elements: Element[];
  generation: number;
}

function registry(): Registry | undefined {
  return (globalThis as Record<string, unknown>)[REGISTRY_KEY] as
    | Registry
    | undefined;
}

function observe(maxChars = 20_000) {
  return contentMain({ kind: "observe", maxChars, mode: "outline" });
}

beforeEach(() => {
  (globalThis as Record<string, unknown>)[REGISTRY_KEY] = undefined;
  document.title = "Fixture";
  document.body.innerHTML = "";
});

describe("outline builder", () => {
  it("describes a form page with labeled refs and states", async () => {
    document.body.innerHTML = `
      <main>
        <h1>Sign in</h1>
        <form>
          <label for="email">Email address</label>
          <input id="email" type="email" required />
          <label for="pw">Password</label>
          <input id="pw" type="password" value="hunter2" />
          <input type="checkbox" id="remember" checked />
          <label for="remember">Remember me</label>
          <button type="submit" disabled>Sign in</button>
        </form>
      </main>`;
    const result = await observe();
    if (!result.ok) {
      throw new Error(result.error);
    }
    const outline = result.outline ?? "";
    expect(outline).toContain("<main>");
    expect(outline).toContain('h1 "Sign in"');
    expect(outline).toContain('[ref=0] textbox "Email address" (required)');
    expect(outline).toContain('[ref=1] textbox "Password" (filled)');
    expect(outline).not.toContain("hunter2");
    expect(outline).toContain('[ref=2] checkbox "Remember me" (checked)');
    expect(outline).toContain('[ref=3] button "Sign in" (disabled)');
    expect(result.generation).toBe(1);
    expect(registry()?.elements).toHaveLength(4);
  });

  it("describes a list page with links and headings", async () => {
    document.body.innerHTML = `
      <nav aria-label="Main">
        <a href="/home">Home</a>
        <a href="/invoices">Invoices</a>
      </nav>
      <h2>Open invoices</h2>
      <ul>
        <li>INV-1 <a href="/invoices/1">View</a></li>
        <li>INV-2 <a href="/invoices/2">View</a></li>
      </ul>`;
    const result = await observe();
    if (!result.ok) {
      throw new Error(result.error);
    }
    const outline = result.outline ?? "";
    expect(outline).toContain('<navigation "Main">');
    expect(outline).toContain('[ref=0] link "Home" (href=/home)');
    expect(outline).toContain('h2 "Open invoices"');
    expect(outline).toContain('"INV-1"');
    expect(outline).toContain('[ref=2] link "View" (href=/invoices/1)');
  });

  it("honors explicit aria roles, labels, and hidden markers", async () => {
    document.body.innerHTML = `
      <div role="button" aria-label="Open menu">☰</div>
      <div role="tab" aria-selected="true">Settings</div>
      <span aria-hidden="true">decorative</span>
      <div style="display:none"><a href="/secret">Hidden link</a></div>
      <input type="hidden" value="csrf" />`;
    const result = await observe();
    if (!result.ok) {
      throw new Error(result.error);
    }
    const outline = result.outline ?? "";
    expect(outline).toContain('[ref=0] button "Open menu"');
    expect(outline).toContain('[ref=1] tab "Settings" (selected)');
    expect(outline).not.toContain("decorative");
    expect(outline).not.toContain("Hidden link");
    expect(outline).not.toContain("csrf");
    expect(registry()?.elements).toHaveLength(2);
  });

  it("clamps the outline to max_chars with an explicit marker", async () => {
    const items = Array.from(
      { length: 200 },
      (_, i) => `<a href="/item/${i}">Item number ${i} with a long label</a>`
    ).join("");
    document.body.innerHTML = `<div>${items}</div>`;
    const result = await observe(600);
    if (!result.ok) {
      throw new Error(result.error);
    }
    const outline = result.outline ?? "";
    expect(outline.length).toBeLessThanOrEqual(600 + "…truncated".length + 1);
    expect(outline).toContain("…truncated");
    expect(outline).not.toContain("Item number 199");
  });

  it("truncates long per-node text without dropping the rest of the page", async () => {
    document.body.innerHTML = `
      <p>${"x".repeat(500)}</p>
      <a href="/after">After the wall of text</a>`;
    const result = await observe();
    if (!result.ok) {
      throw new Error(result.error);
    }
    const outline = result.outline ?? "";
    expect(outline).not.toContain("x".repeat(200));
    expect(outline).toContain('[ref=0] link "After the wall of text"');
  });

  it("text mode returns visible text only", async () => {
    document.body.innerHTML = `
      <h1>Report</h1><p>All numbers are up.</p>
      <div style="display:none">hidden</div>`;
    const result = await contentMain({
      kind: "observe",
      maxChars: 20_000,
      mode: "text",
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.outline).toContain("Report");
    expect(result.outline).toContain("All numbers are up.");
    expect(result.outline).not.toContain("hidden");
  });
});

describe("ref staleness", () => {
  it("clicks a live ref from the current generation and re-observes", async () => {
    document.body.innerHTML = `<button id="go">Go</button><output id="out"></output>`;
    document.getElementById("go")?.addEventListener("click", () => {
      const out = document.getElementById("out");
      if (out) {
        out.textContent = "clicked!";
      }
    });
    const snapshot = await observe();
    if (!snapshot.ok) {
      throw new Error(snapshot.error);
    }
    const result = await contentMain({
      expectedGeneration: snapshot.generation ?? null,
      kind: "click",
      ref: 0,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.observe).toContain("clicked!");
    // The auto-observe advanced the generation.
    expect(result.generation).toBe((snapshot.generation ?? 0) + 1);
  });

  it("rejects acting before any observe", async () => {
    document.body.innerHTML = "<button>Go</button>";
    const result = await contentMain({
      expectedGeneration: null,
      kind: "click",
      ref: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("ref_stale");
    }
  });

  it("rejects a ref from an outdated generation", async () => {
    document.body.innerHTML = "<button>Go</button>";
    const first = await observe();
    if (!first.ok) {
      throw new Error(first.error);
    }
    await observe(); // second snapshot supersedes the first
    const result = await contentMain({
      expectedGeneration: first.generation ?? null,
      kind: "click",
      ref: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("ref_stale");
    }
  });

  it("rejects a ref whose element left the DOM", async () => {
    document.body.innerHTML = "<button id='gone'>Go</button>";
    const snapshot = await observe();
    if (!snapshot.ok) {
      throw new Error(snapshot.error);
    }
    document.getElementById("gone")?.remove();
    const result = await contentMain({
      expectedGeneration: snapshot.generation ?? null,
      kind: "click",
      ref: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("ref_stale");
    }
  });

  it("rejects an out-of-range ref", async () => {
    document.body.innerHTML = "<button>Go</button>";
    const snapshot = await observe();
    if (!snapshot.ok) {
      throw new Error(snapshot.error);
    }
    const result = await contentMain({
      expectedGeneration: snapshot.generation ?? null,
      kind: "click",
      ref: 99,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("ref_stale");
    }
  });
});

describe("fill", () => {
  it("fills an input through the native setter and fires events", async () => {
    document.body.innerHTML = `
      <label for="name">Name</label>
      <input id="name" type="text" />`;
    const input = document.getElementById("name") as HTMLInputElement;
    let inputEvents = 0;
    input.addEventListener("input", () => {
      inputEvents += 1;
    });
    const snapshot = await observe();
    if (!snapshot.ok) {
      throw new Error(snapshot.error);
    }
    const result = await contentMain({
      expectedGeneration: snapshot.generation ?? null,
      kind: "fill",
      ref: 0,
      submit: false,
      value: "Ada",
    });
    expect(result.ok).toBe(true);
    expect(input.value).toBe("Ada");
    expect(inputEvents).toBe(1);
  });

  it("selects an option by visible text", async () => {
    document.body.innerHTML = `
      <select id="plan">
        <option value="s">Starter</option>
        <option value="p">Pro</option>
      </select>`;
    const snapshot = await observe();
    if (!snapshot.ok) {
      throw new Error(snapshot.error);
    }
    const result = await contentMain({
      expectedGeneration: snapshot.generation ?? null,
      kind: "fill",
      ref: 0,
      submit: false,
      value: "Pro",
    });
    expect(result.ok).toBe(true);
    expect((document.getElementById("plan") as HTMLSelectElement).value).toBe(
      "p"
    );
  });

  it("refuses to fill a non-fillable element", async () => {
    document.body.innerHTML = '<a href="/x">Not fillable</a>';
    const snapshot = await observe();
    if (!snapshot.ok) {
      throw new Error(snapshot.error);
    }
    const result = await contentMain({
      expectedGeneration: snapshot.generation ?? null,
      kind: "fill",
      ref: 0,
      submit: false,
      value: "nope",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("unsupported_element");
    }
  });
});

describe("wait_for", () => {
  it("finds existing text immediately", async () => {
    document.body.innerHTML = "<p>Saved successfully</p>";
    const result = await contentMain({
      kind: "wait_for",
      text: "Saved successfully",
      timeoutMs: 500,
    });
    expect(result.ok && result.found).toBe(true);
  });

  it("finds a selector that appears later", async () => {
    document.body.innerHTML = "<div id='host'></div>";
    setTimeout(() => {
      const el = document.createElement("span");
      el.className = "toast";
      document.getElementById("host")?.appendChild(el);
    }, 150);
    const result = await contentMain({
      kind: "wait_for",
      selector: ".toast",
      timeoutMs: 2000,
    });
    expect(result.ok && result.found).toBe(true);
  });

  it("returns found=false on timeout", async () => {
    document.body.innerHTML = "<p>nothing here</p>";
    const result = await contentMain({
      kind: "wait_for",
      text: "never appears",
      timeoutMs: 250,
    });
    expect(result.ok && result.found).toBe(false);
  });
});
