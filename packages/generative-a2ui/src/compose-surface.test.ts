import type {
  Answer,
  ClassifierClient,
  SystemOneRequest,
} from "@engenty/typesafe-client";
import { describe, expect, it } from "vitest";
import { composeSurface, type SurfaceCandidate } from "./compose-surface.js";
import { validateEngentyA2uiComponents } from "./spec.js";

function text(id: string, value: string): Record<string, unknown> {
  return { component: "Text", id, text: value };
}

const CANDIDATES: SurfaceCandidate[] = [
  {
    components: [text("summary", "Two sentences.")],
    description: "The summary.",
    fallback: true,
    id: "summary",
  },
  {
    components: [{ columns: 2, component: "Grid", id: "figures" }],
    description: "Key figures side by side.",
    id: "figures",
  },
  {
    components: [
      { component: "Metric", id: "price", label: "Price", value: "€ 15" },
    ],
    description: "The price.",
    id: "price",
    parent: "figures",
  },
  {
    components: [
      { component: "Metric", id: "seats", label: "Seats", value: "40" },
    ],
    description: "The seat count.",
    id: "seats",
    parent: "figures",
  },
  {
    components: [{ component: "Markdown", id: "brief", text: "Short." }],
    description: "A short brief.",
    group: "body",
    id: "brief",
  },
  {
    components: [{ component: "DetailGrid", id: "facts", rows: [] }],
    description: "A facts grid.",
    fallback: true,
    group: "body",
    id: "facts",
  },
  {
    components: [
      { children: ["open"], component: "Actions", id: "actions" },
      {
        action: {
          event: { context: { artifact_id: "a1" }, name: "open_artifact" },
        },
        component: "Button",
        id: "open",
        label: "Open",
      },
    ],
    description: "The Open button.",
    id: "actions",
    required: true,
  },
];

const GROUPS = [{ id: "body", instructions: "Which body fits?" }];

function jevAnswering(
  answer: (request: SystemOneRequest) => Record<string, Answer>
): ClassifierClient {
  return {
    systemOne: async (request) => ({
      answers: answer(request),
      model: "jev",
    }),
  };
}

function noul(value: number): Answer {
  return { noul: value, type: "noul" };
}

function choice(id: string, ids: string[]): Answer {
  return {
    choice: id,
    confidence: 1,
    probabilities: Object.fromEntries(ids.map((k) => [k, k === id ? 1 : 0])),
    type: "choice",
  };
}

function rootChildren(components: Record<string, unknown>[]): unknown {
  return components.find((c) => c.id === "root")?.children;
}

describe("composeSurface", () => {
  it("keeps what Jev says yes to, one member per group, and the required parts", async () => {
    const surface = await composeSurface({
      candidates: CANDIDATES,
      groups: GROUPS,
      jev: jevAnswering(() => ({
        group_body: choice("brief", ["brief", "facts"]),
        include_price: noul(0.9),
        include_seats: noul(0.1),
        include_summary: noul(0.2),
      })),
      prompt: "Weekly market watch",
    });
    expect(surface.source).toBe("jev");
    expect(surface.kept).toEqual(["figures", "price", "brief", "actions"]);
    expect(rootChildren(surface.components)).toEqual([
      "figures",
      "brief",
      "actions",
    ]);
    expect(
      surface.components.find((c) => c.id === "figures")?.children
    ).toEqual(["price"]);
    expect(validateEngentyA2uiComponents(surface.components)).toEqual([]);
  });

  it("drops a container none of whose children is kept", async () => {
    const surface = await composeSurface({
      candidates: CANDIDATES,
      groups: GROUPS,
      jev: jevAnswering(() => ({
        group_body: choice("facts", ["brief", "facts"]),
        include_price: noul(0),
        include_seats: noul(0),
        include_summary: noul(1),
      })),
      prompt: "x",
    });
    expect(surface.kept).toEqual(["summary", "facts", "actions"]);
  });

  it("falls back to the marked candidates when the call fails", async () => {
    const surface = await composeSurface({
      candidates: CANDIDATES,
      groups: GROUPS,
      jev: {
        systemOne: async () => {
          throw new Error("gateway down");
        },
      },
      prompt: "x",
    });
    expect(surface.source).toBe("fallback");
    expect(surface.kept).toEqual(["summary", "facts", "actions"]);
    expect(validateEngentyA2uiComponents(surface.components)).toEqual([]);
  });

  it("falls back when a group answer names something it was not offered", async () => {
    const surface = await composeSurface({
      candidates: CANDIDATES,
      groups: GROUPS,
      jev: jevAnswering(() => ({
        group_body: choice("price", ["brief", "facts", "price"]),
        include_price: noul(1),
        include_seats: noul(1),
        include_summary: noul(1),
      })),
      prompt: "x",
    });
    expect(surface.source).toBe("fallback");
  });

  it("falls back without a model", async () => {
    const surface = await composeSurface({
      candidates: CANDIDATES,
      groups: GROUPS,
      jev: null,
      prompt: "x",
    });
    expect(surface.source).toBe("fallback");
    expect(surface.kept).toContain("actions");
  });

  it("asks the caller's own questions in the same call and hands back their answers", async () => {
    let calls = 0;
    const surface = await composeSurface({
      candidates: CANDIDATES,
      groups: GROUPS,
      jev: jevAnswering((request) => {
        calls += 1;
        expect(Object.keys(request.questions)).toContain("row_0");
        return {
          group_body: choice("facts", ["brief", "facts"]),
          include_price: noul(0),
          include_seats: noul(0),
          include_summary: noul(0),
          row_0: noul(0.8),
        };
      }),
      prompt: "x",
      questions: { row_0: { instructions: "Row 0 matters.", type: "noul" } },
    });
    expect(calls).toBe(1);
    expect(surface.answers).toEqual({ row_0: noul(0.8) });
  });
});
