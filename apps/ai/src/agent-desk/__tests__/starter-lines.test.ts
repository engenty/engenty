import { describe, expect, it } from "vitest";
import { parseGeneratedStarterLines } from "../starter-lines.js";

describe("parseGeneratedStarterLines", () => {
  it("reads one `label | prompt` starter per line", () => {
    expect(
      parseGeneratedStarterLines(
        "Offene Rechnungen | Zeig mir alle offenen Rechnungen dieses Monats.\nNeuer Kontakt | Lege einen neuen Kontakt aus meiner letzten Mail an.",
        3
      )
    ).toEqual([
      {
        id: "generated_offene_rechnungen",
        label: "Offene Rechnungen",
        prompt: "Zeig mir alle offenen Rechnungen dieses Monats.",
      },
      {
        id: "generated_neuer_kontakt",
        label: "Neuer Kontakt",
        prompt: "Lege einen neuen Kontakt aus meiner letzten Mail an.",
      },
    ]);
  });

  it("ignores fences, intros, markers, quotes and duplicates", () => {
    const starters = parseGeneratedStarterLines(
      [
        "```",
        "Here are your starters:",
        '1. **Plan my week** | "Plan my week from open tasks."',
        "- Plan my week | Again.",
        "",
        "* Draft a reply | Draft a reply to the newest thread.",
        "```",
      ].join("\n"),
      3
    );
    expect(starters.map((starter) => starter.label)).toEqual([
      "Plan my week",
      "Draft a reply",
    ]);
    expect(starters[0]?.prompt).toBe("Plan my week from open tasks.");
  });

  it("caps the count and clamps long fields", () => {
    const long = "x".repeat(60);
    const starters = parseGeneratedStarterLines(
      `${long} | ${"y".repeat(500)}\nA | b\nC | d`,
      2
    );
    expect(starters).toHaveLength(2);
    expect(starters[0]?.label.length).toBe(48);
    expect(starters[0]?.prompt.length).toBe(400);
    expect(starters[0]?.id.length).toBeLessThanOrEqual(64);
  });

  it("accepts a short separator-less line as label and prompt, drops long prose", () => {
    expect(
      parseGeneratedStarterLines(
        `Summarize today\n${"This is a long explanatory sentence that is clearly not a chip label at all."}`,
        3
      )
    ).toEqual([
      {
        id: "generated_summarize_today",
        label: "Summarize today",
        prompt: "Summarize today",
      },
    ]);
  });
});
