import { describe, expect, it } from "vitest";
import {
  checkGateSurface,
  GATE_APPROVE_EVENT,
  GATE_REJECT_EVENT,
  GATE_SUBMIT_EVENT,
  GateSurfaceError,
  gateSurfaceFor,
  operationApprovalSurface,
} from "../gate-surface.js";

function byId(surface: { components: Record<string, unknown>[] }, id: string) {
  return surface.components.find((component) => component.id === id);
}

describe("gateSurfaceFor", () => {
  it("confirm: the facts, a note and approve/reject", () => {
    const surface = gateSurfaceFor("confirm", {
      amount: 4800,
      recipient: "billing@acme.com",
    });
    expect(checkGateSurface(surface)).toBeNull();
    expect(byId(surface, "facts")).toMatchObject({
      component: "DetailGrid",
      rows: [
        { label: "amount", value: "4800" },
        { label: "recipient", value: "billing@acme.com" },
      ],
    });
    expect(byId(surface, "approve")).toMatchObject({
      action: { event: { name: GATE_APPROVE_EVENT } },
    });
    expect(byId(surface, "reject")).toMatchObject({
      action: { event: { name: GATE_REJECT_EVENT } },
    });
    expect(surface.data).toEqual({ reason: "" });
  });

  it("field_updates: every field editable, prefilled with the patch", () => {
    const surface = gateSurfaceFor("field_updates", {
      status: "sent",
      total: 12,
    });
    expect(checkGateSurface(surface)).toBeNull();
    expect(byId(surface, "root")).toMatchObject({ component: "Form" });
    expect(byId(surface, "f0")).toMatchObject({
      component: "TextField",
      label: "status",
      value: { path: "/status" },
    });
    expect(surface.data).toEqual({ status: "sent", total: "12" });
  });

  it("choice: one Select over the options", () => {
    const surface = gateSurfaceFor("choice", {
      options: ["ok", { label: "Nochmal", value: "revise" }],
    });
    expect(checkGateSurface(surface)).toBeNull();
    expect(byId(surface, "choice")).toMatchObject({
      component: "Select",
      options: [
        { label: "ok", value: "ok" },
        { label: "Nochmal", value: "revise" },
      ],
      required: true,
      value: { path: "/choice" },
    });
    expect(byId(surface, "next")).toMatchObject({
      action: { event: { name: GATE_SUBMIT_EVENT } },
    });
  });

  it("surface: passes a valid page through and refuses a broken one", () => {
    const page = {
      components: [{ component: "Text", id: "root", text: "Hi" }],
      data: { a: 1 },
    };
    expect(gateSurfaceFor("surface", page)).toEqual(page);
    expect(() =>
      gateSurfaceFor("surface", {
        components: [{ component: "Nope", id: "root" }],
      })
    ).toThrow(GateSurfaceError);
  });
});

describe("operationApprovalSurface", () => {
  it("names each call with what a person can judge and asks approve/reject", () => {
    const surface = operationApprovalSurface([
      {
        input: {
          due_date: "2026-09-29",
          note: "",
          space_id: "01a0d8be-5bc1-7c3b-bf32-815b6fb0c850",
          title: "Angebot Donau Logistik AG",
        },
        operation_id: "offers_set_status",
        title: "Angebot freigeben",
      },
      { operation_id: "tasks_create" },
    ]);
    expect(checkGateSurface(surface)).toBeNull();
    expect(byId(surface, "call-0")).toMatchObject({
      component: "Text",
      text: "Angebot freigeben",
    });
    // Empty inputs and bare record ids tell the approver nothing.
    expect(byId(surface, "call-0-input")).toMatchObject({
      rows: [
        { label: "Due date", value: "2026-09-29" },
        { label: "Title", value: "Angebot Donau Logistik AG" },
      ],
    });
    // A call without a title reads as its operation id, spelled out.
    expect(byId(surface, "call-1")).toMatchObject({ text: "Tasks create" });
    expect(byId(surface, "call-1-input")).toBeUndefined();
    expect(byId(surface, "approve")).toMatchObject({
      action: { event: { name: GATE_APPROVE_EVENT } },
    });
    expect(byId(surface, "reject")).toMatchObject({
      action: { event: { name: GATE_REJECT_EVENT } },
    });
  });
});
