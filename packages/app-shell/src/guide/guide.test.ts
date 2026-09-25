/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it } from "vitest";
import {
  formatUiGuideFollowUpMessage,
  readUiGuideFollowUp,
  resolveUiGuideTarget,
} from "./resolve-target.js";
import {
  dismissUiGuideSession,
  getUiGuideSession,
  resetUiGuideSessionForTests,
  resolveUiGuideAction,
  showUiGuideSession,
  updateUiGuideSession,
} from "./session.js";

afterEach(() => {
  resetUiGuideSessionForTests();
  document.body.innerHTML = "";
});

describe("resolveUiGuideTarget", () => {
  it("requires exactly one target kind", () => {
    expect(() =>
      resolveUiGuideTarget(
        { field_id: "a", selector: ".b" },
        { getFieldElement: () => null }
      )
    ).toThrow(/exactly one/);
  });

  it("resolves field_id via helper", () => {
    const el = document.createElement("input");
    document.body.append(el);
    expect(
      resolveUiGuideTarget(
        { field_id: "contacts.name" },
        { getFieldElement: (id) => (id === "contacts.name" ? el : null) }
      )
    ).toBe(el);
  });

  it("resolves selector", () => {
    const el = document.createElement("button");
    el.id = "save-btn";
    document.body.append(el);
    expect(
      resolveUiGuideTarget(
        { selector: "#save-btn" },
        { getFieldElement: () => null }
      )
    ).toBe(el);
  });

  it("resolves region via data-engenty-region", () => {
    const el = document.createElement("main");
    el.setAttribute("data-engenty-region", "main");
    document.body.append(el);
    expect(
      resolveUiGuideTarget({ region: "main" }, { getFieldElement: () => null })
    ).toBe(el);
  });

  it("throws when target is missing", () => {
    expect(() =>
      resolveUiGuideTarget(
        { selector: "#missing" },
        { getFieldElement: () => null }
      )
    ).toThrow(/not found/);
  });
});

describe("formatUiGuideFollowUpMessage", () => {
  it("includes guide id and action", () => {
    expect(
      formatUiGuideFollowUpMessage({
        action_id: "next",
        guide_id: "g1",
      })
    ).toBe("[ui_guide] guide_id=g1 action=next");
  });

  it("quotes input values", () => {
    expect(
      formatUiGuideFollowUpMessage({
        action_id: "ok",
        guide_id: "g1",
        input_value: 'say "hi"',
      })
    ).toBe('[ui_guide] guide_id=g1 action=ok input="say \\"hi\\""');
  });

  it("includes named input_values", () => {
    expect(
      formatUiGuideFollowUpMessage({
        action_id: "next",
        guide_id: "g1",
        input_values: { note: "hello", city: "Wien" },
      })
    ).toBe(
      '[ui_guide] guide_id=g1 action=next input.note="hello" input.city="Wien"'
    );
  });
});

describe("readUiGuideFollowUp", () => {
  it("reads back what formatUiGuideFollowUpMessage wrote", () => {
    expect(
      readUiGuideFollowUp(
        formatUiGuideFollowUpMessage({
          action_id: "next",
          guide_id: "g1",
          input_values: { city: 'Wien "Mitte"' },
          label: "Weiter",
          title: "1 von 4 · Die linke Leiste",
        })
      )
    ).toEqual({
      action_id: "next",
      inputs: [{ key: "city", value: 'Wien "Mitte"' }],
      label: "Weiter",
      title: "1 von 4 · Die linke Leiste",
    });
    expect(readUiGuideFollowUp("[ui_guide] guide_id=g1 action=next")).toEqual({
      action_id: "next",
      inputs: [],
      label: null,
      title: null,
    });
  });

  it("leaves ordinary text alone", () => {
    expect(readUiGuideFollowUp("zeig mir [ui_guide] bitte")).toBeNull();
  });
});

describe("ui guide session", () => {
  function mountTarget(): HTMLElement {
    const el = document.createElement("div");
    document.body.append(el);
    return el;
  }

  it("returns shown immediately when wait is false", () => {
    const result = showUiGuideSession({
      target_element: mountTarget(),
      title: "Hello",
    });
    expect(result).toMatchObject({
      ok: true,
      status: "shown",
    });
    expect(getUiGuideSession()?.title).toBe("Hello");
  });

  it("awaits user action when wait is true", async () => {
    const pending = showUiGuideSession({
      target_element: mountTarget(),
      title: "Wait",
      wait: true,
    });
    expect(pending).toBeInstanceOf(Promise);
    const outcome = resolveUiGuideAction({ action_id: "ok" });
    expect(outcome?.wasWaiting).toBe(true);
    expect(outcome?.followUp).toBe(false);
    await expect(pending).resolves.toMatchObject({
      action_id: "ok",
      ok: true,
      status: "resolved",
    });
  });

  it("sends follow-up only for non-wait non-dismiss actions", () => {
    showUiGuideSession({
      target_element: mountTarget(),
      title: "Go",
    });
    const outcome = resolveUiGuideAction({ action_id: "next" });
    expect(outcome?.followUp).toBe(true);
    expect(outcome?.wasWaiting).toBe(false);
  });

  it("does not follow up on dismiss when not waiting", () => {
    showUiGuideSession({
      target_element: mountTarget(),
      title: "Go",
    });
    const outcome = resolveUiGuideAction({
      action_id: "dismiss",
      dismiss: true,
    });
    expect(outcome?.followUp).toBe(false);
    expect(getUiGuideSession()).toBeNull();
  });

  it("update patches the open guide", () => {
    showUiGuideSession({
      target_element: mountTarget(),
      title: "One",
    });
    const result = updateUiGuideSession({ title: "Two", body: "More" });
    expect(result).toMatchObject({ ok: true, status: "shown" });
    expect(getUiGuideSession()?.title).toBe("Two");
    expect(getUiGuideSession()?.body).toBe("More");
  });

  it("dismiss closes and resolves waiters", async () => {
    const pending = showUiGuideSession({
      target_element: mountTarget(),
      title: "Wait",
      wait: true,
    });
    const dismissed = dismissUiGuideSession();
    expect(dismissed.status).toBe("dismissed");
    await expect(pending).resolves.toMatchObject({ status: "dismissed" });
  });

  it("defaults actions to OK", () => {
    showUiGuideSession({
      target_element: mountTarget(),
      title: "Defaults",
    });
    expect(getUiGuideSession()?.actions).toEqual([
      { id: "ok", label: "OK", variant: "primary" },
    ]);
  });

  it("supports highlight and modal presentations", () => {
    showUiGuideSession({
      presentation: "highlight",
      target_element: mountTarget(),
      title: "Ring",
    });
    expect(getUiGuideSession()?.presentation).toBe("highlight");

    showUiGuideSession({
      presentation: "modal",
      title: "Centered",
      show_dismiss: false,
      actions: [
        { id: "back", label: "Back", variant: "ghost" },
        { id: "next", label: "Next", variant: "primary" },
      ],
      inputs: [{ id: "note", label: "Note", type: "textarea", required: true }],
    });
    const modal = getUiGuideSession();
    expect(modal?.presentation).toBe("modal");
    expect(modal?.target_element).toBeNull();
    expect(modal?.show_dismiss).toBe(false);
    expect(modal?.inputs?.[0]?.id).toBe("note");
  });

  it("requires a target for spotlight", () => {
    expect(() =>
      showUiGuideSession({
        title: "Missing target",
        presentation: "spotlight",
      })
    ).toThrow(/target is required/);
  });

  it("returns input_values on resolve", () => {
    showUiGuideSession({
      presentation: "modal",
      title: "Form",
      inputs: [{ id: "a" }, { id: "b" }],
    });
    const outcome = resolveUiGuideAction({
      action_id: "ok",
      input_values: { a: "1", b: "2" },
    });
    expect(outcome?.result.input_values).toEqual({ a: "1", b: "2" });
  });
});
