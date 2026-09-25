import type {
  ClassifierClient,
  SystemOneRequest,
  SystemOneResponse,
} from "@engenty/typesafe-client";
import { describe, expect, it, vi } from "vitest";

import { extractSpans, pickSpans } from "../span-picker.js";
import type { FieldContext } from "../text-helper.js";

const GOAL =
  'Search flights from Wien to Seoul, South Korea, departing 12 Oct 2026 and returning 26 Oct 2026 for 2 adults; passenger name "Grace Hopper", contact ada@example.test.';

describe("extractSpans", () => {
  it("offers the goal's values in order, without sentence starts or duplicates", () => {
    const spans = extractSpans(GOAL);
    expect(spans).toEqual(
      expect.arrayContaining([
        "Wien",
        "Seoul, South Korea",
        "12 Oct 2026",
        "26 Oct 2026",
        "2 adults",
        "Grace Hopper",
        "ada@example.test",
      ])
    );
    expect(spans).not.toContain("Search");
    expect(spans.indexOf("Wien")).toBeLessThan(
      spans.indexOf("Seoul, South Korea")
    );
    expect(new Set(spans).size).toBe(spans.length);
  });

  it("reads numeric dates and quoted values", () => {
    expect(
      extractSpans("Set the date to 2026-10-12 and the code to 'ABC-42'")
    ).toEqual(expect.arrayContaining(["2026-10-12", "ABC-42", "42"]));
    expect(extractSpans("Fahre am 12.10.2026 nach Berlin")).toEqual(
      expect.arrayContaining(["12.10.2026", "Berlin"])
    );
  });

  it("is empty for a goal without values", () => {
    expect(extractSpans("click the button")).toEqual([]);
  });
});

function context(fields: string[]): FieldContext {
  const described = fields.map((label) => ({
    label,
    role: "textbox",
    value: "",
  }));
  return {
    field: described[0] as FieldContext["field"],
    fields: described,
    goal: GOAL,
    page: { text: "Flights", title: "Google Flights" },
    recent_actions: [],
  };
}

function client(
  answer: (request: SystemOneRequest) => SystemOneResponse["answers"]
) {
  const systemOne = vi.fn(async (request: SystemOneRequest) => ({
    answers: answer(request),
    model: "jev-1.13.0",
    usage: { input_tokens: 200, output_tokens: 0 },
  }));
  return { client: { systemOne } as unknown as ClassifierClient, systemOne };
}

const pick = (id: string, ids: string[], p = 0.9) => ({
  choice: id,
  confidence: p,
  probabilities: Object.fromEntries(
    ids.map((k) => [k, k === id ? p : (1 - p) / (ids.length - 1)])
  ),
  type: "choice" as const,
});

describe("pickSpans", () => {
  it("asks one head per field over the same spans plus NONE, and maps ids back to text", async () => {
    const { client: c, systemOne } = client((request) => {
      const ids = Object.keys(request.questions.field_1?.criteria ?? {});
      const of = (text: string) => {
        const criteria = request.questions.field_1?.criteria as Record<
          string,
          string
        >;
        return Object.entries(criteria).find(
          ([, v]) => v === text
        )?.[0] as string;
      };
      return {
        field_1: pick(of("Wien"), ids),
        field_2: pick(of("Seoul, South Korea"), ids),
        field_3: pick("NONE", ids),
      };
    });
    const result = await pickSpans({
      client: c,
      context: context(["Where from?", "Where to?", "Promo code"]),
    });
    expect(result?.values.get("Where from?")).toBe("Wien");
    expect(result?.values.get("Where to?")).toBe("Seoul, South Korea");
    expect(result?.values.get("Promo code")).toBeNull();
    const request = systemOne.mock.calls[0]?.[0] as SystemOneRequest;
    expect(Object.keys(request.questions)).toEqual([
      "field_1",
      "field_2",
      "field_3",
    ]);
    expect(request.questions.field_2?.criteria).toHaveProperty("NONE");
    expect(JSON.stringify(request.questions.field_2?.instructions)).toContain(
      "Where to?"
    );
  });

  it("treats a close call as no value", async () => {
    const { client: c } = client((request) => {
      const ids = Object.keys(request.questions.field_1?.criteria ?? {});
      const [a, b] = ids.filter((k) => k !== "NONE") as [string, string];
      return {
        field_1: {
          choice: a,
          confidence: 0.45,
          probabilities: Object.fromEntries(
            ids.map((k) => [
              k,
              k === a ? 0.45 : k === b ? 0.4 : 0.15 / (ids.length - 2),
            ])
          ),
          type: "choice" as const,
        },
      };
    });
    const result = await pickSpans({
      client: c,
      context: context(["Where to?"]),
    });
    expect(result?.values.get("Where to?")).toBeNull();
  });

  it("refuses an answer outside the offered ids", async () => {
    const { client: c } = client(() => ({
      field_1: pick("s99", ["s99"]),
    }));
    await expect(
      pickSpans({ client: c, context: context(["Where to?"]) })
    ).rejects.toThrow(/typesafe_invalid_choice/);
  });

  it("does not call the classifier for a goal without values", async () => {
    const { client: c, systemOne } = client(() => ({}));
    const result = await pickSpans({
      client: c,
      context: { ...context(["Where to?"]), goal: "click the button" },
    });
    expect(result).toBeNull();
    expect(systemOne).not.toHaveBeenCalled();
  });
});
