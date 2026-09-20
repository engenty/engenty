// The shipped `offers.create` wizard, as a definition.
//
// It is the first module workflow with `metadata.surface: "wizard"`: a gate
// inside an inline loop body, `surface` gates carrying A2UI pages, and one
// `offers_create` call that writes the offer WITH its positions. Everything
// the validator can see is pinned here, so a change to the file that breaks
// the wizard fails before a reconcile ever writes it to a tenant.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModuleWorkflowsFromDirectory } from "@engenty/ai-core";
import { describe, expect, it } from "vitest";
import { validateGraphAction } from "../validate-graph.js";

const workflowsDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../../modules/offers/ai/workflows"
);

function loadDefinition() {
  const loaded = loadModuleWorkflowsFromDirectory({
    moduleId: "offers",
    workflowsDir,
  });
  const wizard = loaded.find((entry) => entry.id === "offers.create");
  expect(wizard).toBeTruthy();
  return wizard as NonNullable<typeof wizard>;
}

type Entry = Record<string, unknown> & { type: string };

function mapConfigOf(entry: Entry | undefined): Record<string, unknown> {
  return JSON.parse(String(entry?.mapConfig ?? "{}")) as Record<
    string,
    unknown
  >;
}

describe("offers.create", () => {
  it("validates as a wizard with no issues", () => {
    const { definition } = loadDefinition();
    expect(
      validateGraphAction(definition as never, { surface: "wizard" })
    ).toEqual([]);
  });

  it("declares the wizard surface and its owner on the metadata", () => {
    const wizard = loadDefinition();
    expect(wizard.definition.metadata).toMatchObject({
      owner_agent_id: "offers.manager",
      surface: "wizard",
      title: "Angebot erstellen",
    });
    expect(wizard.owner_agent_id).toBe("offers.manager");
    expect(wizard.skills).toContain("offers-create-and-edit");
    // Page 0 is not derived from the input: the first gate IS the first page.
    expect(wizard.definition.inputSchema).toEqual({
      properties: {},
      type: "object",
    });
  });

  it("opens on a surface gate, loops draft → review, then creates the offer with its positions", () => {
    const graph = loadDefinition().definition.graph as Entry[];
    const ids = graph.map((entry) => entry.id);
    expect(ids).toEqual([
      "prep-ask",
      "ask-basics",
      "prep-loop",
      undefined,
      "prep-create",
      "create",
      "prep-show",
      "show",
      "done",
    ]);

    const ask = mapConfigOf(graph[0]) as {
      kind: { value: string };
      payload: { value: { components: { component: string }[] } };
    };
    expect(ask.kind.value).toBe("surface");
    expect(ask.payload.value.components.map((c) => c.component)).toEqual([
      "Form",
      "ObjectPicker",
      "TextArea",
      "Actions",
      "Button",
    ]);

    const loop = graph[3] as Entry & {
      loopType: string;
      predicate: { left: { path: string }; right: { literal: string } };
      step: Entry & { id: string; graph: Entry[] };
    };
    expect(loop.type).toBe("loop");
    expect(loop.loopType).toBe("dountil");
    expect(loop.step).toMatchObject({ id: "draftLoop", type: "workflow" });
    // The predicate reads the loop body's output — the carry mapping, whose
    // `event` is what the review gate's button emitted.
    expect(loop.predicate.left.path).toBe("stepResults.draftLoop.event");
    expect(loop.predicate.right.literal).toBe("create");
    expect(loop.step.graph.map((entry) => entry.id)).toEqual([
      "prep-draft",
      "draft",
      "prep-review",
      "review",
      "carry",
    ]);
    const draft = mapConfigOf(loop.step.graph[0]) as {
      agent_type_key: { value: string };
      output_schema: {
        value: {
          properties: { offer: { properties: Record<string, unknown> } };
        };
      };
    };
    expect(draft.agent_type_key.value).toBe("offers.manager");
    // The specialist returns the create input itself, positions included —
    // that is what makes the wizard produce an offer and not a document.
    expect(
      Object.keys(draft.output_schema.value.properties.offer.properties)
    ).toEqual(["title", "client_id", "introduction", "final_notes", "blocks"]);

    const review = mapConfigOf(loop.step.graph[2]) as {
      accepts_text: { value: boolean };
      data: { path: string; step: string };
      kind: { value: string };
      payload: { value: { components: Record<string, unknown>[] } };
    };
    expect(review.kind.value).toBe("surface");
    expect(review.accepts_text.value).toBe(true);
    // The page's data model IS the draft, so the inputs below edit the offer
    // that the create step later writes.
    expect(review.data).toEqual({ path: "output", step: "draft" });
    const positions = review.payload.value.components.find(
      (component) => component.id === "positions"
    ) as { children: { componentId: string; path: string } };
    expect(positions.children).toEqual({
      componentId: "position",
      path: "/offer/blocks",
    });

    // The body's output must carry the same shape it received, so the second
    // iteration reads the customer where the first one did.
    const carry = Object.keys(mapConfigOf(loop.step.graph[4]));
    const seed = Object.keys(mapConfigOf(graph[2]));
    for (const key of seed) {
      expect(carry).toContain(key);
    }

    const create = mapConfigOf(graph[4]) as {
      input: { path: string; step: string };
      tool_id: { value: string };
    };
    expect(create.tool_id.value).toBe("offers_create");
    expect(create.input).toEqual({ path: "offer", step: "draftLoop" });
    expect(graph[5]).toMatchObject({ id: "create", toolId: "engenty_tool" });
    const out = "stepResults.create.output";
    // The offer itself, as a card in the conversation: the desk's record of
    // what the wizard did, in place of the specialist's structured JSON.
    const show = mapConfigOf(graph[6]) as { ref: { template: string } };
    expect(show.ref.template).toBe(`offers:offer:\${${out}.id}`);
    expect(graph[7]).toMatchObject({ id: "show", toolId: "show_objects" });
    // The last mapping is the run's contract: what the wizard says it did.
    // Its closing line links the created offer by name — the wizard page reads
    // that link back as the record and opens it in the pane beside the page,
    // so a generic label would name the pane's tab instead of the offer.
    const done = mapConfigOf(graph[8]) as {
      summary: { template: string };
    };
    expect(done.summary.template).toContain(
      `[\${${out}.offer_number} — \${${out}.title}](\${${out}.link})`
    );
  });
});
