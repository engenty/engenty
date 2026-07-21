// "Prior learnings" brief section (memory Phase 2b): before a specialist run,
// pull the task's project-scoped memories plus the assignee's own lessons and
// append them to the brief, so run N+1 starts from what run N learned. A cheap
// module-op list call — no retrieval round-trip, fail-open, token-capped.

interface MemoryRecordRow {
  agent_type_key?: string | null;
  body_md?: string;
  kind?: string;
  scope_kind?: string;
  scope_ref?: string | null;
  slug?: string;
  title?: string;
}

export interface PriorLearningsInput {
  agentTypeKey: string;
  contexts: Array<{ context_id?: unknown; context_type?: unknown }>;
  /** Extra entity refs (e.g. 'contacts.person:<id>') to include (Phase 3). */
  entityRefs?: string[];
  invoke: (op: string, input: unknown) => Promise<unknown>;
}

// ~1.5k tokens. The section is framing, not the task — cap hard.
const MAX_SECTION_CHARS = 6000;
const MAX_PROJECT_CONTEXTS = 3;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rowsOf(result: unknown): MemoryRecordRow[] {
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as MemoryRecordRow[]) : [];
}

function renderRecord(record: MemoryRecordRow): string {
  const title = str(record.title) || str(record.slug) || "(untitled)";
  const body = str(record.body_md).replace(/\s+/g, " ").slice(0, 400);
  return `- [${str(record.kind) || "fact"}] ${title}${body ? `: ${body}` : ""}`;
}

/**
 * Entity refs for a task's linked contexts. A dotted context_type is already
 * an ontology type id ('contacts.person') → use it verbatim; the legacy bare
 * 'contact' type fans out to both contact entity types.
 */
export function entityRefsFromContexts(
  contexts: Array<{ context_id?: unknown; context_type?: unknown }>
): string[] {
  const refs: string[] = [];
  for (const context of contexts) {
    const type = str(context.context_type);
    const id = str(context.context_id);
    if (!(type && id)) {
      continue;
    }
    if (type === "contact") {
      refs.push(`contacts.person:${id}`, `contacts.organisation:${id}`);
    } else if (type.includes(".")) {
      refs.push(`${type}:${id}`);
    }
  }
  return refs.slice(0, 6);
}

/**
 * Build the "## Prior learnings" markdown section for a task brief, or ""
 * when there is nothing to inject. Never throws.
 */
export async function buildPriorLearningsSection(
  input: PriorLearningsInput
): Promise<string> {
  try {
    const seen = new Set<string>();
    const lines: string[] = [];
    const add = (record: MemoryRecordRow) => {
      const key = `${record.scope_kind}/${record.scope_ref ?? ""}/${record.slug}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      lines.push(renderRecord(record));
    };

    // Project-scoped memories for the task's linked project(s).
    const projectIds = input.contexts
      .filter((context) => str(context.context_type) === "project")
      .map((context) => str(context.context_id))
      .filter(Boolean)
      .slice(0, MAX_PROJECT_CONTEXTS);
    for (const projectId of projectIds) {
      const result = await input.invoke("memory_record_list", {
        limit: 10,
        scope_kind: "project",
        scope_ref: projectId,
        status: "active",
      });
      for (const record of rowsOf(result)) {
        add(record);
      }
    }

    // Entity-scoped memories for objects the task references (Phase 3).
    for (const entityRef of input.entityRefs ?? []) {
      const result = await input.invoke("memory_record_list", {
        limit: 5,
        scope_kind: "entity",
        scope_ref: entityRef,
        status: "active",
      });
      for (const record of rowsOf(result)) {
        add(record);
      }
    }

    // Approved org-wide memories (guidelines, standing decisions) —
    // highest-confidence first, small cap: they apply to every task.
    const orgResult = await input.invoke("memory_record_list", {
      limit: 25,
      scope_kind: "org",
      status: "active",
    });
    const confidenceRank = { high: 0, medium: 1, low: 2 } as const;
    const orgRows = rowsOf(orgResult)
      .sort(
        (a, b) =>
          (confidenceRank[
            (a as { confidence?: string })
              .confidence as keyof typeof confidenceRank
          ] ?? 1) -
          (confidenceRank[
            (b as { confidence?: string })
              .confidence as keyof typeof confidenceRank
          ] ?? 1)
      )
      .slice(0, 8);
    for (const record of orgRows) {
      add(record);
    }

    // The assignee's own lessons (any scope) — what failed before and why.
    const lessons = await input.invoke("memory_record_list", {
      kind: "lesson",
      limit: 25,
      status: "active",
    });
    for (const record of rowsOf(lessons)) {
      if (str(record.agent_type_key) === input.agentTypeKey) {
        add(record);
      }
    }

    if (lines.length === 0) {
      return "";
    }
    let section = [
      "## Prior learnings",
      "Durable memories from earlier work — apply them; update or archive any that prove wrong:",
      ...lines,
    ].join("\n");
    if (section.length > MAX_SECTION_CHARS) {
      section = section.slice(0, MAX_SECTION_CHARS);
    }
    return section;
  } catch {
    // Fail-open: a memory hiccup must never block a task brief.
    return "";
  }
}
