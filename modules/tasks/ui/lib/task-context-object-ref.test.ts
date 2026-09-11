import { describe, expect, it } from "vitest";
import { taskContextObjectRef } from "./task-context-object-ref.js";

describe("taskContextObjectRef", () => {
  it("maps the legacy contact alias to the canonical chat ref", () => {
    expect(
      taskContextObjectRef({
        context_id: "contact-1",
        context_type: "contact",
      })
    ).toEqual({
      entity: "contact",
      id: "contact-1",
      module: "contacts",
    });
  });

  it("maps dotted context types to module and entity", () => {
    expect(
      taskContextObjectRef({
        context_id: "invoice-1",
        context_type: "invoices.invoice",
      })
    ).toEqual({
      entity: "invoice",
      id: "invoice-1",
      module: "invoices",
    });
  });

  it("leaves project and unknown bare context types to task-specific UI", () => {
    expect(
      taskContextObjectRef({ context_id: "project-1", context_type: "project" })
    ).toBeNull();
    expect(
      taskContextObjectRef({
        context_id: "source-1",
        context_type: "kb_source",
      })
    ).toBeNull();
  });
});
