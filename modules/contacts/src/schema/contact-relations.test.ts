import { describe, expect, it } from "vitest";
import {
  isCurrentContactRelation,
  normalizeContactRelationParticipants,
  validateContactRelationParticipants,
} from "./contact-relations.js";

describe("contact relation rules", () => {
  it("normalizes works_at direction to person -> organisation", () => {
    const normalized = normalizeContactRelationParticipants(
      {
        from_contact_id: "org-1",
        relation_type: "works_at",
        to_contact_id: "person-1",
      },
      { id: "org-1", type: "organisation" },
      { id: "person-1", type: "person" }
    );

    expect(normalized.input.from_contact_id).toBe("person-1");
    expect(normalized.input.to_contact_id).toBe("org-1");
    expect(normalized.fromContact.type).toBe("person");
    expect(normalized.toContact.type).toBe("organisation");
  });

  it("rejects invalid works_at direction after normalization", () => {
    const error = validateContactRelationParticipants({
      fromContact: { id: "org-1", type: "organisation" },
      relation_type: "works_at",
      toContact: { id: "org-2", type: "organisation" },
    });

    expect(error).toBe(
      "works_at relations must link a person to an organisation"
    );
  });

  it("rejects self relations", () => {
    const error = validateContactRelationParticipants({
      fromContact: { id: "same", type: "person" },
      relation_type: "works_at",
      toContact: { id: "same", type: "organisation" },
    });

    expect(error).toBe("A contact cannot be related to itself");
  });

  it("treats open or present date windows as current", () => {
    expect(
      isCurrentContactRelation(
        { valid_from: "2026-01-01", valid_to: null },
        new Date("2026-04-08T12:00:00Z")
      )
    ).toBe(true);

    expect(
      isCurrentContactRelation(
        { valid_from: null, valid_to: "2026-03-01" },
        new Date("2026-04-08T12:00:00Z")
      )
    ).toBe(false);
  });

  it("treats valid_to as inclusive for date-only windows", () => {
    expect(
      isCurrentContactRelation(
        { valid_from: null, valid_to: "2026-04-08" },
        new Date("2026-04-08T12:00:00Z")
      )
    ).toBe(true);
  });

  it("leaves non-works_at relations unchanged", () => {
    const normalized = normalizeContactRelationParticipants(
      {
        from_contact_id: "org-1",
        relation_type: "member_of",
        to_contact_id: "person-1",
      },
      { id: "org-1", type: "organisation" },
      { id: "person-1", type: "person" }
    );

    expect(normalized.input.from_contact_id).toBe("org-1");
    expect(normalized.input.to_contact_id).toBe("person-1");
  });
});
