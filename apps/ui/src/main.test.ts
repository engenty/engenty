import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "main.tsx"),
  "utf8"
);

describe("BrowserRouter transitions", () => {
  it("opts out of startTransition so useSyncExternalStore updates cannot starve navigation", () => {
    const withoutComments = mainSource.replace(/^\s*\/\/.*$/gm, "");
    expect(withoutComments).toMatch(
      /<BrowserRouter[\s\S]*?useTransitions=\{false\}/
    );
    expect(withoutComments).not.toMatch(/flushSync/);
  });

  it("records the routing decision and requires interaction smoke on runtime upgrades", () => {
    expect(mainSource).toMatch(/useSyncExternalStore/);
    expect(mainSource).toMatch(/test:smoke:interaction/);
    expect(mainSource).toMatch(/installInteractionDiagnostics/);
  });
});
