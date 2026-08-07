/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_UI_FIELD_ATTR,
  agentUiFieldFormName,
  agentUiFieldSelector,
  isPlausibleAgentUiFieldActiveElement,
  queryAgentUiFieldElement,
} from "./agent-ui-field-element.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("agentUiFieldFormName", () => {
  it("uses the segment after the last dot", () => {
    expect(agentUiFieldFormName("contacts.legal_name")).toBe("legal_name");
  });
});

describe("queryAgentUiFieldElement", () => {
  it("prefers data-agent-ui-field markers", () => {
    document.body.innerHTML = `
      <main data-engenty-region="main">
        <input name="legal_name" />
        <input ${AGENT_UI_FIELD_ATTR}="contacts.legal_name" name="other" />
      </main>
    `;
    const el = queryAgentUiFieldElement("contacts.legal_name");
    expect(el?.getAttribute(AGENT_UI_FIELD_ATTR)).toBe("contacts.legal_name");
  });

  it("falls back to form name inside main", () => {
    document.body.innerHTML = `
      <main data-engenty-region="main">
        <input name="legal_name" id="page-field" />
      </main>
      <textarea name="legal_name" placeholder="Nachricht eingeben…" id="composer"></textarea>
    `;
    const el = queryAgentUiFieldElement("contacts.legal_name");
    expect(el?.id).toBe("page-field");
  });

  it("does not return the composer when only the composer matches by name", () => {
    document.body.innerHTML = `
      <main data-engenty-region="main"><div></div></main>
      <textarea name="legal_name" placeholder="Nachricht eingeben…"></textarea>
    `;
    expect(queryAgentUiFieldElement("contacts.legal_name")).toBeNull();
  });
});

describe("isPlausibleAgentUiFieldActiveElement", () => {
  it("rejects the composer active element", () => {
    document.body.innerHTML = `
      <main data-engenty-region="main">
        <input name="legal_name" />
      </main>
      <textarea placeholder="Nachricht eingeben…"></textarea>
    `;
    const composer = document.querySelector("textarea");
    expect(
      isPlausibleAgentUiFieldActiveElement("contacts.legal_name", composer)
    ).toBe(false);
  });

  it("accepts the matching named input in main", () => {
    document.body.innerHTML = `
      <main data-engenty-region="main">
        <input name="legal_name" />
      </main>
    `;
    const input = document.querySelector("input");
    expect(
      isPlausibleAgentUiFieldActiveElement("contacts.legal_name", input)
    ).toBe(true);
  });
});

describe("agentUiFieldSelector", () => {
  it("escapes the field id for CSS selectors", () => {
    expect(agentUiFieldSelector("contacts.legal_name")).toBe(
      `[${AGENT_UI_FIELD_ATTR}="${CSS.escape("contacts.legal_name")}"]`
    );
  });
});
