import { describe, expect, it } from "vitest";
import {
  buildEngentyA2uiMessages,
  ENGENTY_A2UI_CATALOG_ID,
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
