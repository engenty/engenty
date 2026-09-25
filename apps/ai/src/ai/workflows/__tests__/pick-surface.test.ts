import { describe, expect, it, vi } from "vitest";
import { pickAuthoredGate } from "../pick-surface.js";

const BASICS = {
  description: "Ask who the offer is for.",
  id: "basics",
  kind: "surface" as const,
  payload: {
    components: [
      {
        children: ["customer", "notes", "next"],
        component: "Form",
        id: "root",
        submit: { event: { name: "next" } },
      },
      {
        component: "ObjectPicker",
        entity: "contacts:contact",
        id: "customer",
        label: "Customer",
        value: { path: "/customer" },
      },
      {
        component: "TextArea",
        id: "notes",
        label: "Notes",
        value: { path: "/notes" },
      },
      {
        action: { event: { name: "next" } },
        component: "Button",
        id: "next",
        label: "Next",
      },
    ],
    data: { customer: null, notes: "" },
  },
  optional_fields: [
    { description: "Include an optional notes field.", id: "notes" },
  ],
  title: "Who is this for?",
};

const REVIEW = {
  description: "Show the draft for review.",
  id: "review",
  kind: "surface" as const,
  payload: {
    components: [{ component: "Text", id: "root", text: "Review" }],
    data: {},
  },
  title: "Review",
};

describe("pickAuthoredGate", () => {
  it("picks the first authored page when Jev is not configured", async () => {
    const picked = await pickAuthoredGate(
      {
        candidates: [BASICS, REVIEW],
        prompt: "Start the offer",
      },
      null
    );
    expect(picked.gate_id).toBe("basics");
    expect(picked.surface.components.some((c) => c.id === "notes")).toBe(true);
  });

  it("keeps Jev's page and drops optional fields below the floor", async () => {
    const jev = {
      systemOne: vi.fn(async () => ({
        answers: {
          gate: {
            choice: "basics",
            confidence: 0.9,
            probabilities: { basics: 0.9, review: 0.1 },
            type: "choice",
          },
          include_basics_notes: { noul: 0.1, type: "noul" },
        },
      })),
    };
    const picked = await pickAuthoredGate(
      {
        candidates: [BASICS, REVIEW],
        prompt: "Skip the notes",
      },
      jev as never
    );
    expect(picked.gate_id).toBe("basics");
    expect(picked.surface.components.some((c) => c.id === "notes")).toBe(false);
    expect(picked.payload.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          children: ["customer", "next"],
          id: "root",
        }),
      ])
    );
  });
});
