import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getContactsDraftApplyHandler,
  setContactsDraftApplyHandler,
} from "./copilot-draft-bridge.js";

const { addContactRoleMock, removeContactRoleMock, updateContactMock } =
  vi.hoisted(() => ({
    addContactRoleMock: vi.fn(),
    removeContactRoleMock: vi.fn(),
    updateContactMock: vi.fn(),
  }));

vi.mock("./api.js", () => ({
  addContactRole: addContactRoleMock,
  removeContactRole: removeContactRoleMock,
  updateContact: updateContactMock,
}));

import { contactsCopilotContribution } from "./copilot-contribution.js";

describe("contactsCopilotContribution.applySuggestions", () => {
  beforeEach(() => {
    addContactRoleMock.mockReset();
    removeContactRoleMock.mockReset();
    updateContactMock.mockReset();
  });

  it("applies entity fields and fixed-role changes through the existing API helpers", async () => {
    await contactsCopilotContribution.applySuggestions?.(
      {
        display_name: "Acme GmbH",
        website_impress: "https://acme.test/impressum",
        add_role_partner: "true",
        add_role_unknown: "true",
        remove_role_supplier: "1",
      },
      {
        scope: { entityId: "contact-1" },
      } as never
    );

    expect(updateContactMock).toHaveBeenCalledWith("contact-1", {
      display_name: "Acme GmbH",
      website_impress: "https://acme.test/impressum",
    });
    expect(addContactRoleMock).toHaveBeenCalledWith("contact-1", "partner");
    expect(addContactRoleMock).toHaveBeenCalledTimes(1);
    expect(removeContactRoleMock).toHaveBeenCalledWith("contact-1", "supplier");
    expect(removeContactRoleMock).toHaveBeenCalledTimes(1);
  });

  it("fails when the current context has no contact id", async () => {
    await expect(
      contactsCopilotContribution.applySuggestions?.(
        { display_name: "Acme GmbH" },
        { scope: {} } as never
      )
    ).rejects.toThrow("No contact id in current context.");
  });

  it("resolves the active edit-draft apply handler", async () => {
    const appliedPatches: Record<string, string | null>[] = [];
    const handler = async (patch: Record<string, string | null>) => {
      appliedPatches.push(patch);
    };

    setContactsDraftApplyHandler(handler);
    expect(getContactsDraftApplyHandler()).toBe(handler);

    const resolvedHandler =
      contactsCopilotContribution.resolveApplySuggestions?.({
        pathname: "/mdl/contacts/contact-1/edit",
        scope: { currentModule: "contacts", entityId: "contact-1" },
      }) ?? null;

    expect(resolvedHandler).toBe(handler);
    await resolvedHandler?.({ legal_name: "Acme GmbH" });
    expect(appliedPatches).toEqual([{ legal_name: "Acme GmbH" }]);

    setContactsDraftApplyHandler(null);
  });

  it("invalidates contact queries after apply and assistant turns", async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };
    const args = {
      pathname: "/mdl/contacts/contact-1",
      queryClient,
      scope: { entityId: "contact-1" },
    };

    await contactsCopilotContribution.onApplySuccess?.(args);
    await contactsCopilotContribution.onAssistantTurnFinish?.(args);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["contacts", "detail", "contact-1"],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["contacts"],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(4);
  });
});
