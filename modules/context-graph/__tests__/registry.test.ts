// Ontology registry — pure in-memory validation. No DB required.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createOntologyRegistry } from "../src/registry.js";

function withRegistry() {
  const r = createOntologyRegistry();
  r.registerSchema({
    moduleId: "contacts",
    entityTypes: [
      {
        id: "contacts.person",
        displayName: "Person",
        attributesSchema: z.object({
          email: z.string().email().optional(),
          display_name: z.string().optional(),
        }),
      },
      {
        id: "contacts.organisation",
        displayName: "Organisation",
        attributesSchema: z.object({
          name: z.string().optional(),
          domain: z.string().optional(),
        }),
      },
    ],
    edgeTypes: [
      {
        id: "contacts.works_at",
        displayName: "works at",
        subjectTypes: ["contacts.person"],
        objectTypes: ["contacts.organisation"],
        attributesSchema: z.object({ role: z.string().optional() }),
      },
    ],
  });
  return r;
}

describe("context-graph registry", () => {
  it("registers entity and edge types and exposes them via getOntology", () => {
    const r = withRegistry();
    const onto = r.getOntology();
    expect(Object.keys(onto.entityTypes)).toEqual(
      expect.arrayContaining(["contacts.person", "contacts.organisation"])
    );
    expect(onto.entityTypes["contacts.person"].moduleId).toBe("contacts");
    expect(onto.edgeTypes["contacts.works_at"].subjectTypes).toEqual([
      "contacts.person",
    ]);
  });

  it("rejects duplicate entity ids across registrations", () => {
    const r = withRegistry();
    expect(() =>
      r.registerSchema({
        moduleId: "other",
        entityTypes: [
          {
            id: "contacts.person",
            displayName: "Person v2",
            attributesSchema: z.object({}),
          },
        ],
      })
    ).toThrow(/duplicate entity type/);
  });

  it("rejects malformed dotted ids", () => {
    const r = createOntologyRegistry();
    expect(() =>
      r.registerSchema({
        moduleId: "x",
        entityTypes: [
          {
            id: "NoDot",
            displayName: "Bad",
            attributesSchema: z.object({}),
          },
        ],
      })
    ).toThrow(/invalid entity type id/);
    expect(() =>
      r.registerSchema({
        moduleId: "x",
        edgeTypes: [
          {
            id: "X.bad",
            displayName: "bad",
            subjectTypes: ["a.b"],
            objectTypes: ["a.c"],
          },
        ],
      })
    ).toThrow(/invalid edge type id/);
  });

  it("validateEntity throws on unknown type", () => {
    const r = withRegistry();
    expect(() =>
      r.validateEntity({ type: "contacts.alien", attributes: {} })
    ).toThrow(/unknown entity type/);
  });

  it("validateEntity surfaces Zod errors on bad attributes", () => {
    const r = withRegistry();
    expect(() =>
      r.validateEntity({
        type: "contacts.person",
        attributes: { email: "not-an-email" },
      })
    ).toThrow();
  });

  it("validateEdge rejects subject/object types outside the allow-list", () => {
    const r = withRegistry();
    expect(() =>
      r.validateEdge({
        type: "contacts.works_at",
        subjectType: "contacts.organisation",
        objectType: "contacts.organisation",
        attributes: {},
      })
    ).toThrow(/does not allow subject type/);
    expect(() =>
      r.validateEdge({
        type: "contacts.works_at",
        subjectType: "contacts.person",
        objectType: "contacts.person",
        attributes: {},
      })
    ).toThrow(/does not allow object type/);
  });

  it("validateEdge accepts known subject/object pairs and returns parsed attributes", () => {
    const r = withRegistry();
    const { attributes } = r.validateEdge({
      type: "contacts.works_at",
      subjectType: "contacts.person",
      objectType: "contacts.organisation",
      attributes: { role: "lead" },
    });
    expect(attributes).toEqual({ role: "lead" });
  });

  it("edge type without subjectTypes or objectTypes is rejected at registration", () => {
    const r = createOntologyRegistry();
    expect(() =>
      r.registerSchema({
        moduleId: "x",
        edgeTypes: [
          {
            id: "x.empty",
            displayName: "empty",
            subjectTypes: [],
            objectTypes: ["a.b"],
          },
        ],
      })
    ).toThrow(/at least one subjectType/);
  });
});
