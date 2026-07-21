// Entity-scope refs (memory Phase 3): scope_ref = '<dotted-type>:<id>',
// e.g. 'contacts.person:7f3a…'. The type id mirrors the context-graph
// ontology, so memory works for ANY registered entity type — contacts today;
// invoices, vendors, projects as soon as their modules register schemas.
// Fail-soft: without a graph host (or an empty ontology) refs are accepted
// on format alone, no existence check.

export interface ParsedEntityRef {
  id: string;
  typeId: string;
}

/** Shape of the context-graph server API we consult (structural, optional). */
export interface EntityRefOntologySource {
  getOntology(): { entityTypes: Record<string, unknown> };
}

// '<module>.<entity>' dotted type (at least one dot), then ':', then a
// non-empty id. Type segments stay lowercase kebab/snake like ontology ids.
const ENTITY_REF_PATTERN =
  /^([a-z0-9][a-z0-9_-]*(?:\.[a-z0-9][a-z0-9_-]*)+):(.+)$/;

export function parseEntityRef(ref: string): ParsedEntityRef {
  const match = ENTITY_REF_PATTERN.exec(ref.trim());
  if (!(match?.[1] && match[2])) {
    throw new Error(
      `invalid entity ref '${ref}' — expected '<dotted-type>:<id>', e.g. 'contacts.person:<uuid>'`
    );
  }
  return { id: match[2], typeId: match[1] };
}

export type EntityRefValidator = (ref: string) => ParsedEntityRef;

/**
 * Build a validator bound to the host's context-graph ontology. Format errors
 * always throw; unknown-type errors only when an ontology with registered
 * entity types is actually available (fail-soft without the graph host).
 */
export function createEntityRefValidator(
  contextGraph: EntityRefOntologySource | null | undefined
): EntityRefValidator {
  return (ref: string) => {
    const parsed = parseEntityRef(ref);
    let entityTypes: Record<string, unknown> | null = null;
    try {
      entityTypes = contextGraph?.getOntology().entityTypes ?? null;
    } catch {
      entityTypes = null;
    }
    if (
      entityTypes &&
      Object.keys(entityTypes).length > 0 &&
      !(parsed.typeId in entityTypes)
    ) {
      throw new Error(
        `unknown entity type '${parsed.typeId}' — valid types: ${Object.keys(entityTypes).sort().join(", ")}`
      );
    }
    return parsed;
  };
}
