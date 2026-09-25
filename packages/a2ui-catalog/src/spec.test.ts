import { describe, expect, it } from "vitest";
import {
  A2UI_SURFACE_MAX_BYTES,
  buildEngentyA2uiMessages,
  ENGENTY_A2UI_CATALOG_ID,
  ENGENTY_A2UI_COMPONENT_NAMES,
  formSurfaceFromSchema,
  validateEngentyA2uiComponents,
} from "./spec.js";

const VALID = [
  { id: "root", component: "List", children: ["hdr", "row1", "actions"] },
  { id: "hdr", component: "Text", text: "Contacts", variant: "h3" },
  {
    id: "row1",
    component: "Row",
    title: { path: "/contacts/0/name" },
    objectRef: "contacts:contact:5c241491-0000-0000-0000-000000000000",
  },
  { id: "actions", component: "Actions", children: ["btn"] },
  {
    id: "btn",
    component: "Button",
    label: "Show all",
    action: { event: { name: "show_all" } },
  },
];

describe("validateEngentyA2uiComponents", () => {
  it("accepts a valid flat component list", () => {
    expect(validateEngentyA2uiComponents(VALID)).toEqual([]);
  });

  it("rejects unknown components before anything reaches the user", () => {
    const issues = validateEngentyA2uiComponents([
      { id: "root", component: "Iframe" },
    ]);
    expect(issues.some((i) => i.message.includes("unknown component"))).toBe(
      true
    );
  });

  it("accepts a repeated row and the relative bindings inside it", () => {
    expect(
      validateEngentyA2uiComponents([
        {
          id: "root",
          component: "Column",
          children: { componentId: "row", path: "/offer/blocks" },
        },
        {
          id: "row",
          component: "TextField",
          value: { path: "content_json/title" },
        },
      ])
    ).toEqual([]);
  });

  it("rejects a children template that names no component or no array", () => {
    const issues = validateEngentyA2uiComponents([
      { id: "root", component: "Column", children: { path: "blocks" } },
    ]);
    expect(
      issues.some((i) => i.message.includes("{ componentId, path }"))
    ).toBe(true);
  });

  it("requires a root component", () => {
    const issues = validateEngentyA2uiComponents([
      { id: "a", component: "Text", text: "x" },
    ]);
    expect(issues.some((i) => i.message.includes("root"))).toBe(true);
  });

  it("rejects dangling child references and duplicate ids", () => {
    const dangling = validateEngentyA2uiComponents([
      { id: "root", component: "List", children: ["missing"] },
    ]);
    expect(dangling.some((i) => i.message.includes("missing"))).toBe(true);
    const duplicate = validateEngentyA2uiComponents([
      { id: "root", component: "List" },
      { id: "root", component: "Text" },
    ]);
    expect(duplicate.some((i) => i.message.includes("duplicate"))).toBe(true);
  });
});

describe("buildEngentyA2uiMessages", () => {
  it("assembles createSurface → updateComponents → updateDataModel", () => {
    const { messages } = buildEngentyA2uiMessages({
      components: VALID,
      data: { contacts: [{ name: "Anna" }] },
      surfaceId: "s1",
    });
    expect(messages).toHaveLength(3);
    expect(messages[0].createSurface).toMatchObject({
      catalogId: ENGENTY_A2UI_CATALOG_ID,
      surfaceId: "s1",
    });
    expect(messages[1].updateComponents).toMatchObject({ surfaceId: "s1" });
    expect(messages[2].updateDataModel).toMatchObject({
      path: "/",
      surfaceId: "s1",
    });
  });

  it("omits the data message when there is no data", () => {
    const { messages } = buildEngentyA2uiMessages({
      components: VALID,
      surfaceId: "s2",
    });
    expect(messages).toHaveLength(2);
  });
});

const INPUT_SURFACE = [
  {
    id: "root",
    component: "Form",
    children: ["name", "long", "n", "sel", "multi", "ok", "date", "obj", "col"],
    submit: { event: { name: "next" } },
  },
  {
    id: "name",
    component: "TextField",
    label: "Name",
    value: { path: "/name" },
    required: true,
  },
  { id: "long", component: "TextArea", value: { path: "/long" }, rows: 4 },
  {
    id: "n",
    component: "NumberField",
    value: { path: "/n" },
    min: 0,
    max: 10,
    step: 1,
  },
  {
    id: "sel",
    component: "Select",
    value: { path: "/sel" },
    options: [{ value: "a", label: "A" }],
  },
  {
    id: "multi",
    component: "MultipleChoice",
    value: { path: "/multi" },
    options: [{ value: "x", label: "X" }],
    style: "chips",
  },
  { id: "ok", component: "CheckBox", value: { path: "/ok" }, label: "OK" },
  { id: "date", component: "DateInput", value: { path: "/date" } },
  {
    id: "obj",
    component: "ObjectPicker",
    value: { path: "/obj" },
    entity: "contact",
  },
  {
    id: "col",
    component: "Column",
    gap: "sm",
    children: [
      "card",
      "inline",
      "div",
      "call",
      "md",
      "img",
      "tbl",
      "doc",
      "grid",
      "bar",
      "line",
      "area",
      "donut",
      "acts",
    ],
  },
  { id: "card", component: "Card", title: "Card", children: [] },
  { id: "inline", component: "Inline", gap: "sm", children: ["div"] },
  { id: "div", component: "Divider" },
  { id: "call", component: "Callout", text: "Note", tone: "warning" },
  { id: "md", component: "Markdown", text: "# Hi" },
  { id: "img", component: "Image", url: "https://example.com/a.png", alt: "a" },
  {
    id: "tbl",
    component: "Table",
    columns: [{ key: "a", label: "A" }],
    rows: { path: "/rows" },
  },
  { id: "doc", component: "Document", artifactRef: "art-1" },
  { id: "grid", component: "Grid", columns: 2, children: ["metric"] },
  {
    id: "metric",
    component: "Metric",
    label: "Unread",
    value: { path: "/unread" },
    sparkline: { path: "/spark" },
  },
  {
    id: "bar",
    component: "BarChart",
    title: "Senders",
    points: { path: "/senders" },
  },
  {
    id: "line",
    component: "LineChart",
    points: { path: "/volume" },
  },
  {
    id: "area",
    component: "AreaChart",
    points: { path: "/volume" },
  },
  {
    id: "donut",
    component: "DonutChart",
    slices: { path: "/categories" },
  },
  { id: "acts", component: "Actions", children: ["go"] },
  {
    id: "go",
    component: "Button",
    label: "Go",
    action: { event: { name: "next" } },
  },
];

describe("validateEngentyA2uiComponents — inputs, layout, outputs", () => {
  it("accepts every component name", () => {
    expect(validateEngentyA2uiComponents(INPUT_SURFACE)).toEqual([]);
    const used = new Set(INPUT_SURFACE.map((c) => c.component));
    for (const name of ENGENTY_A2UI_COMPONENT_NAMES) {
      if (
        !(
          used.has(name) ||
          ["List", "Row", "DetailGrid", "Badge", "Text"].includes(name)
        )
      ) {
        throw new Error(`fixture does not cover ${name}`);
      }
    }
  });

  it("rejects a binding path that is not a JSON pointer", () => {
    const issues = validateEngentyA2uiComponents([
      { id: "root", component: "TextField", value: { path: "" } },
    ]);
    expect(
      issues.some((i) => i.message.includes("must be a JSON pointer"))
    ).toBe(true);
    const nested = validateEngentyA2uiComponents([
      {
        id: "root",
        component: "DetailGrid",
        rows: [{ label: "x", value: { path: "the name" } }],
      },
    ]);
    expect(nested.some((i) => i.componentId === "root")).toBe(true);
  });

  it("rejects a Form with more than one submit or a malformed submit", () => {
    const many = validateEngentyA2uiComponents([
      {
        id: "root",
        component: "Form",
        submit: [{ event: { name: "a" } }, { event: { name: "b" } }],
      },
    ]);
    expect(many.some((i) => i.message.includes("at most one submit"))).toBe(
      true
    );
    const malformed = validateEngentyA2uiComponents([
      { id: "root", component: "Form", submit: { name: "a" } },
    ]);
    expect(
      malformed.some((i) => i.message.includes("submit must be an action"))
    ).toBe(true);
    const nested = validateEngentyA2uiComponents([
      {
        id: "root",
        component: "Form",
        children: ["inner"],
        submit: { event: { name: "a" } },
      },
      { id: "inner", component: "Form", submit: { event: { name: "b" } } },
    ]);
    expect(
      nested.some((i) => i.message.includes("contains another Form"))
    ).toBe(true);
  });

  it("requires non-empty options for Select and MultipleChoice", () => {
    for (const component of ["Select", "MultipleChoice"]) {
      const missing = validateEngentyA2uiComponents([
        { id: "root", component, value: { path: "/v" } },
      ]);
      expect(missing.some((i) => i.message.includes("options"))).toBe(true);
      const empty = validateEngentyA2uiComponents([
        { id: "root", component, value: { path: "/v" }, options: [] },
      ]);
      expect(empty.some((i) => i.message.includes("options"))).toBe(true);
    }
  });

  it("requires ObjectPicker.entity and Table.columns", () => {
    const picker = validateEngentyA2uiComponents([
      { id: "root", component: "ObjectPicker", value: { path: "/v" } },
    ]);
    expect(picker.some((i) => i.message.includes("entity"))).toBe(true);
    const table = validateEngentyA2uiComponents([
      { id: "root", component: "Table", rows: [] },
    ]);
    expect(table.some((i) => i.message.includes("columns"))).toBe(true);
  });

  it("exports the shared surface byte limit", () => {
    expect(A2UI_SURFACE_MAX_BYTES).toBe(65_536);
  });
});

describe("formSurfaceFromSchema", () => {
  const byId = (
    surface: { components: Record<string, unknown>[] },
    id: string
  ) => surface.components.find((c) => c.id === id) as Record<string, unknown>;

  it("maps string, long text, date and x-ref properties", () => {
    const surface = formSurfaceFromSchema({
      type: "object",
      properties: {
        name: { type: "string", title: "Name", description: "Full name" },
        notes: { type: "string", format: "long" },
        story: { type: "string", maxLength: 500 },
        due: { type: "string", format: "date" },
        contact: { type: "string", "x-ref": "contacts:contact" },
      },
    });
    expect(validateEngentyA2uiComponents(surface.components)).toEqual([]);
    expect(byId(surface, "field-name")).toMatchObject({
      component: "TextField",
      help: "Full name",
      label: "Name",
      value: { path: "/name" },
    });
    expect(byId(surface, "field-notes").component).toBe("TextArea");
    expect(byId(surface, "field-story").component).toBe("TextArea");
    expect(byId(surface, "field-due").component).toBe("DateInput");
    expect(byId(surface, "field-contact")).toMatchObject({
      component: "ObjectPicker",
      entity: "contacts:contact",
    });
  });

  it("maps enum, number, boolean and array-of-enum properties", () => {
    const surface = formSurfaceFromSchema({
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["a", "b"],
          "x-enum-labels": { a: "Alpha" },
        },
        qty: { type: "integer", minimum: 1, maximum: 9 },
        price: { type: "number", multipleOf: 0.5 },
        agree: { type: "boolean" },
        tags: {
          type: "array",
          items: {
            type: "string",
            enum: ["x", "y"],
            "x-enum-labels": ["Ex", "Why"],
          },
        },
      },
    });
    expect(validateEngentyA2uiComponents(surface.components)).toEqual([]);
    expect(byId(surface, "field-kind")).toMatchObject({
      component: "Select",
      options: [
        { label: "Alpha", value: "a" },
        { label: "b", value: "b" },
      ],
    });
    expect(byId(surface, "field-qty")).toMatchObject({
      component: "NumberField",
      max: 9,
      min: 1,
      step: 1,
    });
    expect(byId(surface, "field-price")).toMatchObject({
      component: "NumberField",
      step: 0.5,
    });
    expect(byId(surface, "field-agree").component).toBe("CheckBox");
    expect(byId(surface, "field-tags")).toMatchObject({
      component: "MultipleChoice",
      options: [
        { label: "Ex", value: "x" },
        { label: "Why", value: "y" },
      ],
    });
  });

  it("honours required, defaults and previous values; unknown types become JSON text", () => {
    const surface = formSurfaceFromSchema(
      {
        type: "object",
        title: "Step",
        required: ["name"],
        properties: {
          name: { type: "string", default: "Anna" },
          qty: { type: "integer", default: 2 },
          meta: { type: "object", properties: { a: { type: "string" } } },
        },
      },
      { qty: 5, meta: { a: "b" } },
      { submitEvent: "ok", submitLabel: "Done" }
    );
    expect(validateEngentyA2uiComponents(surface.components)).toEqual([]);
    expect(byId(surface, "field-name").required).toBe(true);
    expect(byId(surface, "field-qty").required).toBeUndefined();
    expect(byId(surface, "field-meta").component).toBe("TextArea");
    expect(surface.data).toEqual({
      meta: JSON.stringify({ a: "b" }, null, 2),
      name: "Anna",
      qty: 5,
    });
    expect(byId(surface, "root")).toMatchObject({
      component: "Form",
      submit: { event: { name: "ok" } },
    });
    expect((byId(surface, "root").children as string[])[0]).toBe("title");
    expect(byId(surface, "title")).toMatchObject({
      component: "Text",
      text: "Step",
    });
    expect(byId(surface, "submit")).toMatchObject({
      action: { event: { name: "ok" } },
      label: "Done",
    });
  });
});
