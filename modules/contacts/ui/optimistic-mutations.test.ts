import { describe, expect, it } from "vitest";
import type { ContactListItem } from "./api/contacts.js";
import {
  contactMatchesList,
  optimisticContact,
} from "./contact-list-optimistic.js";
import { patchContact } from "./optimistic-mutations.js";

describe("contact optimistic cache reducers", () => {
  it("patches a cached detail without mutating its snapshot", () => {
    const current = {
      display_name: "Before",
      email: "before@example.com",
      id: "contact-1",
      roles: ["client"],
    } as ContactListItem;

    const patched = patchContact(current, {
      email: "after@example.com",
    });

    expect(patched?.email).toBe("after@example.com");
    expect(patched?.display_name).toBe("Before");
    expect(current.email).toBe("before@example.com");
  });

  it("does not synthesize uncached contact detail", () => {
    expect(patchContact(undefined, { email: "after@example.com" })).toBe(
      undefined
    );
  });

  it("creates a temporary contact with an optimistic ID", () => {
    const contact = optimisticContact(
      {
        contact_name: "Ada",
        created_by: null,
        display_name: "Ada",
        type: "person",
      } as never,
      "opt_contact"
    );
    expect(contact.id).toBe("opt_contact");
    expect(contact.display_name).toBe("Ada");
    expect(contact.roles).toEqual([]);
  });

  it("keeps temporary creates out of mismatched filters", () => {
    const contact = optimisticContact(
      {
        contact_name: "Ada",
        created_by: null,
        display_name: "Ada Lovelace",
        email: "ada@example.com",
        type: "person",
      } as never,
      "opt_contact"
    );

    expect(contactMatchesList(contact, { search: "lovelace" })).toBe(true);
    expect(contactMatchesList(contact, { search: "grace" })).toBe(false);
    expect(contactMatchesList(contact, { type: "organisation" })).toBe(false);
    expect(contactMatchesList(contact, { role: "client" })).toBe(false);
  });
});
