// In-memory ontology registry. Merges every `registerContextGraphSchema`
// into one store keyed by dotted type id. Validates type ids, attributes,
// and (subject, object) pairs before the server API hits the DAL. No DB
// table for types — rebuilt on each plugin boot.

import type {
  ContextGraphSchemaRegistration,
  EdgeTypeSpec,
  EntityTypeSpec,
} from "@engenty/plugin-sdk";
import { z } from "zod";

const DOTTED_ID_PATTERN = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;

export interface OntologyEntityType extends EntityTypeSpec {
  moduleId: string;
}

export interface OntologyEdgeType extends EdgeTypeSpec {
  moduleId: string;
}

export interface OntologySnapshot {
  edgeTypes: Record<string, OntologyEdgeType>;
  entityTypes: Record<string, OntologyEntityType>;
}

export interface OntologyRegistry {
  getOntology(): OntologySnapshot;
  registerSchema(input: ContextGraphSchemaRegistration): void;
  validateEdge(input: {
    attributes: unknown;
    objectType: string;
    subjectType: string;
    type: string;
  }): { attributes: Record<string, unknown> };
  validateEntity(input: { attributes: unknown; type: string }): {
    attributes: Record<string, unknown>;
  };
}

function assertDottedId(id: string, kind: "edge" | "entity"): void {
  if (typeof id !== "string" || !DOTTED_ID_PATTERN.test(id)) {
    throw new Error(
      `context-graph: invalid ${kind} type id "${id}" — expected dotted lowercase id like "<module>.<name>"`
    );
  }
}

function toAttributes(parsed: unknown): Record<string, unknown> {
  if (parsed && typeof parsed === "object") {
    return parsed as Record<string, unknown>;
  }
  return {};
}

const fallbackAttributes = z.record(z.string(), z.unknown());

export function createOntologyRegistry(): OntologyRegistry {
  const entityTypes = new Map<string, OntologyEntityType>();
  const edgeTypes = new Map<string, OntologyEdgeType>();

  return {
    registerSchema(input) {
      const moduleId = input.moduleId?.trim();
      if (!moduleId) {
        throw new Error(
          "context-graph: registerSchema requires a non-empty moduleId"
        );
      }
      for (const spec of input.entityTypes ?? []) {
        assertDottedId(spec.id, "entity");
        if (entityTypes.has(spec.id)) {
          const existing = entityTypes.get(spec.id);
          if (existing?.moduleId !== moduleId) {
            throw new Error(
              `context-graph: duplicate entity type "${spec.id}" — already registered by module "${existing?.moduleId}"`
            );
          }
        }
        entityTypes.set(spec.id, { ...spec, moduleId });
      }
      for (const spec of input.edgeTypes ?? []) {
        assertDottedId(spec.id, "edge");
        if (edgeTypes.has(spec.id)) {
          const existing = edgeTypes.get(spec.id);
          if (existing?.moduleId !== moduleId) {
            throw new Error(
              `context-graph: duplicate edge type "${spec.id}" — already registered by module "${existing?.moduleId}"`
            );
          }
        }
        if (
          !Array.isArray(spec.subjectTypes) ||
          spec.subjectTypes.length === 0
        ) {
          throw new Error(
            `context-graph: edge type "${spec.id}" must declare at least one subjectType`
          );
        }
        if (!Array.isArray(spec.objectTypes) || spec.objectTypes.length === 0) {
          throw new Error(
            `context-graph: edge type "${spec.id}" must declare at least one objectType`
          );
        }
        edgeTypes.set(spec.id, { ...spec, moduleId });
      }
    },

    getOntology() {
      return {
        edgeTypes: Object.fromEntries(edgeTypes.entries()),
        entityTypes: Object.fromEntries(entityTypes.entries()),
      };
    },

    validateEntity({ type, attributes }) {
      const spec = entityTypes.get(type);
      if (!spec) {
        throw new Error(`context-graph: unknown entity type "${type}"`);
      }
      const parsed = spec.attributesSchema.parse(attributes ?? {});
      return { attributes: toAttributes(parsed) };
    },

    validateEdge({ type, subjectType, objectType, attributes }) {
      const spec = edgeTypes.get(type);
      if (!spec) {
        throw new Error(`context-graph: unknown edge type "${type}"`);
      }
      if (!spec.subjectTypes.includes(subjectType)) {
        throw new Error(
          `context-graph: edge "${type}" does not allow subject type "${subjectType}" (allowed: ${spec.subjectTypes.join(", ")})`
        );
      }
      if (!spec.objectTypes.includes(objectType)) {
        throw new Error(
          `context-graph: edge "${type}" does not allow object type "${objectType}" (allowed: ${spec.objectTypes.join(", ")})`
        );
      }
      const schema = spec.attributesSchema ?? fallbackAttributes;
      const parsed = schema.parse(attributes ?? {});
      return { attributes: toAttributes(parsed) };
    },
  };
}
