// Lean coverage for contacts AI registration. Outcomes that matter:
//
//   1. **Catalog-first actions** — contact search runs through catalog ops,
//      not a standalone `contacts_contact_search` action registration.
//
//   2. **Enhance action tool allowlist** — no legacy direct frontend-tool or
//      draft-patch shortcuts on the enhance workflow.
//
//   3. **Dynamic runtime shape** — module capability exposes catalog runner
//      tools and HITL helpers, not per-operation Mastra wrapper tools.
//
// We do not snapshot instruction bodies, skill inventories, or trigger order —
// those are owned by markdown manifests and loader wiring.

import { describe, expect, it, vi } from "vitest";
import {
  CONTACTS_MANAGER_AGENT_ID,
  CONTACTS_MANAGER_DYNAMIC_TOOL_IDS,
  CONTACTS_MANAGER_SKILL_IDS,
} from "../contacts-manager.js";
import {
  contactsAiRegistration,
  contactsDynamicAiCapability,
} from "../registrar.js";

const noopInvokeContactsOperation = vi.fn(async () => null);

describe("contactsAiRegistration", () => {
  it("does not register contacts.contact.search as a standalone action", () => {
    const registration = contactsAiRegistration({
      invokeContactsOperation: noopInvokeContactsOperation,
    });

    expect(
      registration.workflows?.some(
        (action) => action.id === "contacts.enhance-contact"
      )
    ).toBe(true);
    expect(
      registration.workflows?.some(
        (action) => action.id === "contacts_contact_search"
      )
    ).toBe(false);
  });

  it("keeps enhance-contact off legacy direct frontend tools", () => {
    const registration = contactsAiRegistration({
      invokeContactsOperation: noopInvokeContactsOperation,
    });
    const enhanceAction = registration.workflows?.find(
      (action) => action.id === "contacts.enhance-contact"
    );

    expect(enhanceAction?.allowed_tools).not.toContain(
      "ui_contacts_applyDraftPatch"
    );
    expect(enhanceAction?.allowed_tools).not.toContain("invoke_frontend_tool");
  });
});

describe("contactsDynamicAiCapability", () => {
  it("exposes catalog-led tools instead of per-operation wrappers", () => {
    const invokeContactsOperation = vi.fn(async () => null);
    const capability = contactsDynamicAiCapability({ invokeContactsOperation });

    expect(capability.moduleId).toBe("contacts");
    expect(capability.agentConfigs?.[0]).toMatchObject({
      id: CONTACTS_MANAGER_AGENT_ID,
      skillIds: CONTACTS_MANAGER_SKILL_IDS,
      source: "module",
      toolIds: CONTACTS_MANAGER_DYNAMIC_TOOL_IDS,
    });

    expect(capability.tools).toHaveProperty("web_search");
    expect(capability.tools).not.toHaveProperty("austriaCompanyLookup");
    expect(capability.tools).not.toHaveProperty("firmenbuch");
    expect(capability.tools).not.toHaveProperty("uidCheck");
    expect(capability.tools).not.toHaveProperty("searchContacts");
    expect(capability.tools).not.toHaveProperty("createContact");
    expect(capability.tools).not.toHaveProperty("loadContact");

    expect(capability.skills?.["contacts-search-and-retrieve"]).toContain(
      "contacts_contact_search"
    );
    expect(invokeContactsOperation).not.toHaveBeenCalled();
  });
});
