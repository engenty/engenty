import { describe, expect, it } from "vitest";

import {
  ACT,
  buildActionSpace,
  buildQuestions,
  TARGET_HEAD,
} from "../action-space.js";
import type { SnapshotAction } from "../snapshot.js";

const field = (over: Partial<SnapshotAction>): SnapshotAction => ({
  id: "e0",
  kind: "fill",
  label: "Where to?",
  node: 1,
  role: "combobox",
  value: "",
  ...over,
});

describe("buildActionSpace", () => {
  it("gives one index per node and lets the element kind name the operation", () => {
    const space = buildActionSpace([
      field({ id: "e1", kind: "fill" }),
      field({ id: "e2", kind: "click", label: "Open Where to?" }),
      { id: "e3", kind: "click", label: "Search", node: 2, role: "button" },
    ]);
    expect(space.elements.map((e) => [e.index, e.label, e.operation])).toEqual([
      ["1", "Where to?", "TYPE_TEXT"],
      ["2", "Search", "CLICK"],
    ]);
    // The editable field's companion "Open …" click is not a separate step.
    expect(Object.keys(space.targets)).toEqual(["1", "2"]);
    expect(space.targets["1"]?.id).toBe("e1");
    expect(space.targets["2"]?.id).toBe("e3");
  });

  it("turns select options into index:n targets and keeps the current value", () => {
    const space = buildActionSpace([
      {
        current_value: "Economy",
        id: "e1",
        kind: "select",
        label: "Cabin → Business",
        node: 7,
        role: "combobox",
        value: "business",
      },
      {
        current_value: "Economy",
        id: "e2",
        kind: "select",
        label: "Cabin → First",
        node: 7,
        role: "combobox",
        value: "first",
      },
    ]);
    expect(space.elements).toHaveLength(1);
    expect(space.elements[0]?.operation).toBe("SELECT");
    expect(space.elements[0]?.value).toBe("Economy");
    expect(space.elements[0]?.options?.map((o) => o.index)).toEqual([
      "1:1",
      "1:2",
    ]);
    expect(space.targets["1:2"]?.value).toBe("first");
  });

  it("offers only the first of two interchangeable elements", () => {
    const space = buildActionSpace([
      { id: "e1", kind: "click", label: "Search", node: 1, role: "button" },
      { id: "e2", kind: "click", label: "Search", node: 9, role: "button" },
      {
        checked: "true",
        id: "e3",
        kind: "click",
        label: "Direct",
        node: 3,
        role: "checkbox",
      },
      {
        checked: "false",
        id: "e4",
        kind: "click",
        label: "Direct",
        node: 4,
        role: "checkbox",
      },
    ]);
    expect(space.elements.map((e) => e.label)).toEqual([
      "Search",
      "Direct",
      "Direct",
    ]);
    expect(space.targets["1"]?.id).toBe("e1");
  });

  it("routes scroll and wait to the operation head only", () => {
    const space = buildActionSpace([
      { delta: 560, id: "scroll_down", kind: "scroll", label: "Scroll down" },
      { id: "wait", kind: "wait", label: "Wait for the page to update" },
    ]);
    expect(space.elements).toEqual([]);
    expect(space.targets).toEqual({});
    expect(Object.keys(space.controls)).toEqual(["SCROLL_DOWN", "WAIT"]);
  });
});

describe("buildQuestions", () => {
  it("offers ACT plus the controls and DONE/BLOCKED, with one target head over every element", () => {
    const space = buildActionSpace([
      field({ id: "e1", kind: "fill" }),
      { id: "e2", kind: "click", label: "Search", node: 2, role: "button" },
      { id: "wait", kind: "wait", label: "Wait for the page to update" },
    ]);
    const { operations, questions } = buildQuestions(space, "Find flights");
    expect(Object.keys(operations).sort()).toEqual(
      [ACT, "BLOCKED", "DONE", "WAIT"].sort()
    );
    expect(Object.keys(questions).sort()).toEqual(
      ["operation", TARGET_HEAD].sort()
    );
    const criteria = questions[TARGET_HEAD]?.criteria as Record<
      string,
      { element: string; operation: string }
    >;
    expect(Object.keys(criteria)).toEqual(["1", "2"]);
    expect(criteria["1"]).toMatchObject({
      element: "[1] Where to?",
      operation: "TYPE_TEXT",
    });
    expect(criteria["2"]).toMatchObject({
      element: "[2] Search",
      operation: "CLICK",
    });
    // The goal travels with every head; its wording is not asserted.
    expect(JSON.stringify(questions.operation?.instructions)).toContain(
      "Find flights"
    );
  });

  it("has neither ACT nor a target head when the page offers no element", () => {
    const space = buildActionSpace([
      { id: "wait", kind: "wait", label: "Wait for the page to update" },
    ]);
    const { operations, questions } = buildQuestions(space, "go");
    expect(operations).not.toHaveProperty(ACT);
    expect(questions).not.toHaveProperty(TARGET_HEAD);
  });
});
