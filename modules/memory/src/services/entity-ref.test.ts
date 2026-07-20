import { describe, expect, it } from "vitest";
import {
  createEntityRefValidator,
  parseEntityRef,
} from "./entity-ref.js";

describe("parseEntityRef", () => {
  it("parses '<dotted-type>:<id>' refs", () => {
    expect(parseEntityRef("contacts.person:7f3a-uuid")).toEqual({
      id: "7f3a-uuid",
      typeId: "contacts.person",
    });
    expect(parseEntityRef("invoices.invoice:abc:with:colons")).toEqual({
      id: "abc:with:colons",
      typeId: "invoices.invoice",
    });
  });

  it("rejects malformed refs", () => {
    for (const bad of ["", "contacts.person", "person:123", "Foo.Bar:1", ":x"]) {
      expect(() => parseEntityRef(bad)).toThrow(/invalid entity ref/);
    }
  });
});

describe("createEntityRefValidator", () => {
  const ontology = {
    getOntology: () => ({
      entityTypes: {
        "contacts.organisation": {},
        "contacts.person": {},
      },
    }),
  };

  it("accepts known ontology types and rejects unknown ones", () => {
    const validate = createEntityRefValidator(ontology);
    expect(validate("contacts.person:1").typeId).toBe("contacts.person");
    expect(() => validate("foo.bar:123")).toThrow(
      /unknown entity type 'foo\.bar'/
    );
  });

  it("fails soft without a graph host or with an empty ontology", () => {
    expect(createEntityRefValidator(null)("foo.bar:123").typeId).toBe(
      "foo.bar"
    );
    expect(
      createEntityRefValidator({
        getOntology: () => ({ entityTypes: {} }),
      })("foo.bar:123").id
    ).toBe("123");
    expect(
      createEntityRefValidator({
        getOntology: () => {
          throw new Error("graph host down");
        },
      })("foo.bar:123").typeId
    ).toBe("foo.bar");
  });

  it("still rejects malformed refs even without an ontology", () => {
    expect(() => createEntityRefValidator(null)("not-a-ref")).toThrow(
      /invalid entity ref/
    );
  });
});
