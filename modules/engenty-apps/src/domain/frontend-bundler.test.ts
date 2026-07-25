import { describe, expect, it } from "vitest";
import {
  bundleFrontend,
  FrontendBuildError,
  isBundledEntry,
} from "./frontend-bundler.js";

describe("isBundledEntry", () => {
  it("treats an html entry as a ready-made document", () => {
    expect(isBundledEntry("index.html")).toBe(false);
  });

  it("treats source entries as bundle mode", () => {
    expect(isBundledEntry("src/main.tsx")).toBe(true);
    expect(isBundledEntry("src/main.jsx")).toBe(true);
    expect(isBundledEntry("main.ts")).toBe(true);
    expect(isBundledEntry("main.js")).toBe(true);
  });
});

describe("bundleFrontend", () => {
  it("bundles a multi-file React app into one document", async () => {
    const { html } = await bundleFrontend({
      entry: "src/main.tsx",
      files: {
        "src/App.tsx": `
          import { useState } from "react";
          import { Total } from "./components/Total";
          export function App() {
            const [count, setCount] = useState(0);
            return (
              <div>
                <button onClick={() => setCount(count + 1)}>add</button>
                <Total value={count} />
              </div>
            );
          }
        `,
        "src/components/Total.tsx": `
          export function Total({ value }: { value: number }) {
            return <p className="total">Total: {value}</p>;
          }
        `,
        "src/main.tsx": `
          import { createRoot } from "react-dom/client";
          import { App } from "./App";
          import "./styles.css";
          createRoot(document.getElementById("root")!).render(<App />);
        `,
        "src/styles.css": ".total{font-weight:600}",
      },
      title: "Counter",
    });

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<head>");
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain("<title>Counter</title>");
    // The component tree, React itself and the CSS all made it in.
    expect(html).toContain("Total:");
    expect(html).toContain(".total{font-weight:600}");
    // React itself is in the document, not left as an unresolved import.
    expect(html).not.toContain('from"react"');
    expect(html.length).toBeGreaterThan(50_000);
  });

  it("resolves the engenty:bridge virtual module", async () => {
    const { html } = await bundleFrontend({
      entry: "main.tsx",
      files: {
        "main.tsx": `
          import { action, data, engenty } from "engenty:bridge";
          void engenty("inbox_threads_list", {});
          void action("collect", {});
          void data.get("draft");
        `,
      },
      title: "Bridge",
    });

    expect(html).toContain("ui/notifications/initialized");
    expect(html).toContain("engenty_call");
    expect(html).toContain("app_action");
  });

  it("reports a syntax error with file and line", async () => {
    const failure = await bundleFrontend({
      entry: "main.tsx",
      files: { "main.tsx": "export const broken = {" },
      title: "Broken",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FrontendBuildError);
    expect((failure as FrontendBuildError).buildLog).toContain("main.tsx");
    expect((failure as FrontendBuildError).buildLog).toContain("ERROR");
  });

  it("refuses an import outside the allow-list and names it", async () => {
    const failure = await bundleFrontend({
      entry: "main.tsx",
      files: { "main.tsx": `import axios from "axios";\nvoid axios;` },
      title: "Undeclared",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FrontendBuildError);
    expect((failure as FrontendBuildError).buildLog).toContain("axios");
    expect((failure as FrontendBuildError).buildLog).toContain("react");
  });

  it("reports a missing relative import", async () => {
    const failure = await bundleFrontend({
      entry: "main.tsx",
      files: { "main.tsx": `import { gone } from "./gone";\nvoid gone;` },
      title: "Missing",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FrontendBuildError);
    expect((failure as FrontendBuildError).buildLog).toContain("./gone");
  });

  it("reports a missing entry file", async () => {
    const failure = await bundleFrontend({
      entry: "src/main.tsx",
      files: { "other.tsx": "export const x = 1;" },
      title: "No entry",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(FrontendBuildError);
    expect((failure as FrontendBuildError).buildLog).toContain("src/main.tsx");
  });

  it("neutralises a closing script tag hidden in a string literal", async () => {
    const { html } = await bundleFrontend({
      entry: "main.ts",
      files: {
        "main.ts": `document.title = ${JSON.stringify("</script><h1>escaped")};`,
      },
      title: "Escaping",
    });

    expect(html).not.toContain("</script><h1>escaped");
    expect(html).toContain("<\\/script>");
  });
});
