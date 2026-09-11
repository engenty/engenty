// Save-path validation for a stored action graph.
//
// A graph is UNTRUSTED INPUT: written by an LLM, editable by a tenant user,
// persisted, and later executed headlessly with a service principal. Everything
// that makes it governable is checked here, once, before it becomes a version.
//
// Two validators run:
//   1. Mastra's `validateStoredWorkflow` — structure, references, schema flow
//      over the deterministic spine.
//   2. This module — the engenty rules Mastra cannot know about.
//
// The rule that does the most work is CONSTANT ARGUMENTS. A declarative `tool`
// entry receives its input from upstream data, not from the node definition —
// so `engenty_tool`'s `tool_id` could in principle be computed at run time. A
// computed tool id is ungovernable: nothing at save time could tell you which
// capability the graph needs. So a graph must feed each primitive's governing
// arguments from a `{ value: … }` constant in the immediately preceding mapping
// entry, and anything else is rejected. Fail closed, loudly, at save.

import { validateEngentyA2uiComponents } from "@engenty/a2ui-catalog/spec";
import {
  parseMapConfig,
  validateDynamicWorkflow,
  type WorkflowValidationIssue,
} from "@mastra/core/workflows";
import { ARTIFACT_TYPE_IDS } from "../artifacts/artifact-types.js";
import {
  APPROVAL_GATE_PRIMITIVE_ID,
  ARTIFACT_WRITE_PRIMITIVE_ID,
  ENGENTY_TOOL_PRIMITIVE_ID,
  GRAPH_ACTION_PRIMITIVE_IDS,
  isGraphActionPrimitiveId,
  RUN_SPECIALIST_PRIMITIVE_ID,
  SHOW_UI_PRIMITIVE_ID,
  WAIT_UNTIL_PRIMITIVE_ID,
} from "./primitive-ids.js";
import { GRAPH_RUN_CONTEXT } from "./run-context-keys.js";

/** A validation problem, in the shape the canvas renders on a node. */
export interface GraphValidationIssue {
  /** Stable code so the UI can pick an icon/severity without parsing prose. */
  code:
    | "mastra"
    | "unknown-tool"
    | "dynamic-tool-id"
    | "dynamic-agent-key"
    | "missing-output-schema"
    | "tenant-identity-in-graph"
    | "capability-missing"
    | "container-in-container"
    | "container-without-steps"
    | "loop-without-condition"
    | "gate-in-foreach"
    | "sleep-too-long"
    | "invalid-ui-surface"
    | "unknown-artifact-type"
    | "unknown-entry-type"
    | "wait-without-time";
  /** Entry id when the issue belongs to one node — the canvas badge anchor. */
  entryId?: string;
  message: string;
  path: string;
}

/**
 * A Mastra `DynamicWorkflowGraph` as we hold it in memory — every field the
 * format defines, so a definition can be read, checked and written back
 * without losing the ones nothing here looks at. `metadata` in particular is
 * defined as "preserved through storage": dropping it would break the one
 * promise the field makes.
 */
export interface GraphWorkflowDefinition {
  description?: string;
  graph: unknown[];
  id: string;
  inputSchema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  requestContextSchema?: Record<string, unknown>;
  stateSchema?: Record<string, unknown>;
}

export interface ValidateGraphActionOptions {
  /**
   * Maps a module operation id to the capability it requires. Injected rather
   * than imported so the validator stays a pure function over the graph.
   */
  capabilityForOperation?: (operationId: string) => string | undefined;
  /**
   * Does the AUTHOR hold this capability? An `engenty_tool` node may only name
   * an operation the author could invoke themselves — a graph must not be a way
   * to launder a privileged call through the service principal.
   *
   * A predicate rather than a list because engenty capabilities are patterns
   * (`module.invoices.*`): callers pass `scopeCoversCapability`, so a holder of
   * `module.invoices.*` legitimately passes a `module.invoices.write` check.
   * Superadmin stays a separate boolean gate elsewhere (AUTH-06) — nothing here
   * should special-case it.
   *
   * Omit (with `capabilityForOperation`) to skip the capability pass — read-only
   * preflight on a graph nobody is saving yet.
   */
  holdsCapability?: (capabilityId: string) => boolean;
}

/**
 * Longest wait a raw `sleep` / `sleepUntil` entry may declare.
 *
 * Mastra's engine awaits those IN-PROCESS: `run.start()` does not return until
 * the timer elapses (pinned by sleep-behaviour.integration.test.ts), and the
 * `suspend` handed to a dynamic sleep is an explicit no-op. A short wait is
 * therefore fine, but a multi-day one would be held open by a live process and
 * stranded by the next deploy.
 *
 * This cap is NOT a limit on how long a flow may wait — `wait_until` waits
 * arbitrarily long by suspending instead of sleeping, and the `graph-wake`
 * system job resumes it. The cap only says which of the two mechanisms is
 * honest at which duration, and the issue message names the right one. Finding
 * out at author time is a small annoyance; finding out because a "chase in 5
 * days" never fired is a silent failure that erodes trust in every other flow.
 */
export const MAX_SLEEP_MS = 15 * 60 * 1000;

/**
 * Largest `show_ui` surface a node may carry, matching the agent tool's own
 * cap. A node's payload is stored JSON, so this has to hold at SAVE time —
 * finding out at run time means a flow that dies at step 7.
 */
export const MAX_UI_PAYLOAD_BYTES = 65_536;

// Request-context keys are the run's identity channel. A graph that sets them
// (via a mapping `value`) would be asserting its own tenant — exactly the
// escalation this design exists to prevent.
const FORBIDDEN_GRAPH_KEYS = new Set<string>(Object.values(GRAPH_RUN_CONTEXT));

type SerializedEntry = Record<string, unknown> & { type?: unknown };

/**
 * Every entry type the engine understands.
 *
 * An LLM's most natural mistake is to use the TOOL NAME as the entry type —
 * `{ "type": "run_specialist", "args": {…} }` instead of
 * `{ "type": "tool", "toolId": "run_specialist" }`. That graph is meaningless
 * to the engine, but it slips past the tool checks below (which only look at
 * `type === "tool"`) and past Mastra's own validator, so it saves and renders
 * as a row of blank steps. Naming the legal set is what makes that fail closed
 * — and the issue message is what tells the model how to fix it.
 */
/** Entry types that hold other entries. Their children must be single steps. */
const CONTAINER_ENTRY_TYPES = new Set([
  "conditional",
  "foreach",
  "loop",
  "parallel",
]);

/**
 * Mastra's own entry union. Kept in step with it deliberately: Mastra's graph
 * traversal ignores an entry type it does not know rather than reporting it,
 * so a type listed here but absent there would validate clean and then do
 * nothing at all on the run.
 */
const KNOWN_ENTRY_TYPES = new Set([
  "agent",
  "conditional",
  "foreach",
  "loop",
  "mapping",
  "parallel",
  "sleep",
  "sleepUntil",
  "step",
  "tool",
  "workflow",
]);

function entryId(entry: SerializedEntry): string | undefined {
  return typeof entry.id === "string" ? entry.id : undefined;
}

/**
 * Constant arguments a mapping entry produces: `{ key: { value } }` sources
 * only. Non-constant sources are deliberately absent from the result, which is
 * what makes "I could not prove this is a constant" indistinguishable from "it
 * isn't there" — both reject.
 */
function constantsFromMapping(
  entry: SerializedEntry
): Record<string, unknown> | undefined {
  if (entry.type !== "mapping" || typeof entry.mapConfig !== "string") {
    return;
  }
  let config: Record<string, unknown>;
  try {
    config = parseMapConfig(entry.mapConfig, entryId(entry) ?? "<mapping>");
  } catch {
    return;
  }
  const constants: Record<string, unknown> = {};
  for (const [key, source] of Object.entries(config)) {
    if (source && typeof source === "object" && "value" in source) {
      constants[key] = (source as { value: unknown }).value;
    }
  }
  return constants;
}

/**
 * Walk every entry, descending into composite containers, with its path and
 * the entry whose output feeds it.
 *
 * `previous` is what the constant-arguments rule reads, so getting it right
 * across nesting is what makes that rule correct rather than merely strict:
 *
 *  · At one level it's the preceding sibling — the mapping before the tool.
 *  · Entering a container, the FIRST entry of each branch is fed by whatever
 *    fed the container, not by the container. A mapping placed before a
 *    conditional really does supply the constants for the first node inside
 *    each branch, and treating that as "computed" rejected a graph that was
 *    correct (observed on a live draft).
 *  · A conditional's / parallel's `steps` are ALTERNATIVES, not a sequence, so
 *    they each start from the container's input rather than from each other.
 */
function* walkEntries(
  entries: readonly unknown[],
  basePath: string,
  inForeach = false,
  initialPrevious?: SerializedEntry,
  siblingsAreBranches = false
): Generator<{
  entry: SerializedEntry;
  inForeach: boolean;
  path: string;
  previous?: SerializedEntry;
}> {
  let previous = initialPrevious;
  for (const [index, raw] of entries.entries()) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const entry = raw as SerializedEntry;
    const path = `${basePath}.${index}`;
    yield { entry, inForeach, path, ...(previous ? { previous } : {}) };

    if (Array.isArray(entry.steps)) {
      yield* walkEntries(
        entry.steps,
        `${path}.steps`,
        inForeach,
        previous,
        entry.type === "conditional" || entry.type === "parallel"
      );
    }
    if (entry.step && typeof entry.step === "object") {
      const nestedForeach = inForeach || entry.type === "foreach";
      yield* walkEntries([entry.step], `${path}.step`, nestedForeach, previous);
    }
    // Branch alternatives don't feed each other, so `previous` stays put.
    if (!siblingsAreBranches) {
      previous = entry;
    }
  }
}

/**
 * Validate a graph for saving. Returns every issue found — the canvas shows
 * them all at once rather than making the author fix one, resave, repeat.
 */
export function validateGraphAction(
  def: GraphWorkflowDefinition,
  options: ValidateGraphActionOptions = {}
): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];

  // 1. Mastra's own validation over the deterministic spine. The tools index is
  // exactly our primitives — a reference to anything else is a missing-ref
  // there and an `unknown-tool` here, whichever fires first.
  // Derived from the id list, never restated: a primitive missing from this
  // map validates as `missing-reference` even though it runs perfectly well at
  // dispatch — a drift that reads as "the graph is wrong" when the truth is
  // "the validator wasn't told".
  //
  // Wrapped, because `validateStoredWorkflow` THROWS on some malformed graphs
  // rather than reporting them: its schema-flow pass walks `entry.steps` on a
  // conditional/parallel without checking the field exists, so a model that
  // emits `{ type: "conditional" }` with no steps takes out the whole call
  // with a TypeError. Every caller here hands it UNTRUSTED JSON — an LLM
  // draft, a preflight of an unsaved edit — so a throw would surface as a 500
  // on the exact input this function exists to reject. A graph Mastra cannot
  // even analyze is an invalid graph, so that is what it becomes.
  let mastraIssues: WorkflowValidationIssue[] = [];
  try {
    mastraIssues = validateDynamicWorkflow(def as never, {
      tools: Object.fromEntries(
        GRAPH_ACTION_PRIMITIVE_IDS.map((id) => [id, {}])
      ),
    });
  } catch (err) {
    issues.push({
      code: "mastra",
      message: `the graph is malformed and could not be analyzed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      path: "graph",
    });
  }
  for (const issue of mastraIssues) {
    issues.push({
      code: "mastra",
      message: `${issue.code}: ${issue.message}`,
      path: issue.path,
    });
  }

  // 2. Engenty rules. `previous` comes from the walk rather than being tracked
  // here: the entry that feeds a node depends on nesting, and a flat "last
  // thing yielded" is wrong inside containers.
  for (const { entry, inForeach, path, previous } of walkEntries(
    def.graph,
    "graph"
  )) {
    const id = entryId(entry);

    const entryType = typeof entry.type === "string" ? entry.type : "";
    if (!KNOWN_ENTRY_TYPES.has(entryType)) {
      issues.push({
        code: "unknown-entry-type",
        message: isGraphActionPrimitiveId(entryType)
          ? `"${entryType}" is a toolId, not an entry type — write { "type": "tool", "toolId": "${entryType}" } and feed its arguments from the mapping before it`
          : `"${entryType || "(missing)"}" is not a valid entry type`,
        path,
        ...(id ? { entryId: id } : {}),
      });
    }

    // A conditional/parallel is a CONTAINER — its branches live in `steps`.
    // The natural mistake is to write it as an inline if (`{ type:
    // "conditional", predicate: … }`), which Mastra's schema-flow pass then
    // crashes on. Caught generically above, but a graph is far easier to fix
    // when the issue names the node and says what's missing.
    if (
      (entry.type === "conditional" || entry.type === "parallel") &&
      !Array.isArray(entry.steps)
    ) {
      issues.push({
        code: "container-without-steps",
        message: `a ${entry.type} needs a "steps" array holding the branch entries${
          entry.type === "conditional"
            ? ', plus a "predicates" array with one predicate per branch'
            : ""
        }`,
        path,
        ...(id ? { entryId: id } : {}),
      });
    }

    // A conditional routes by position: `predicates[i]` guards `steps[i]`. A
    // length mismatch silently leaves a branch either unguarded or unreachable,
    // which is invisible on the canvas — the branch simply never runs.
    if (
      entry.type === "conditional" &&
      Array.isArray(entry.steps) &&
      Array.isArray(entry.predicates) &&
      entry.steps.length !== entry.predicates.length
    ) {
      issues.push({
        code: "container-without-steps",
        message: `this conditional has ${entry.steps.length} branch(es) but ${entry.predicates.length} predicate(s) — they pair up by position, so the counts must match`,
        path,
        ...(id ? { entryId: id } : {}),
      });
    }

    // foreach/loop take a SINGULAR `step`. Writing `steps` here is the natural
    // slip once you've written a conditional, and it produces a container whose
    // body never runs.
    if (
      (entry.type === "foreach" || entry.type === "loop") &&
      !(entry.step && typeof entry.step === "object")
    ) {
      issues.push({
        code: "container-without-steps",
        message: `a ${entry.type} needs a single "step" entry (not "steps") holding its body`,
        path,
        ...(id ? { entryId: id } : {}),
      });
    }

    // A container's children are `SingleStepEntry`s — step, tool, agent,
    // mapping, workflow. A container is NOT one, so nesting them is outside the
    // stored-graph contract. Mastra's validator is lenient here (it descends and
    // only complains that the inner entry has no `id`), which makes the graph
    // look nearly-valid while being unrunnable — so reject it explicitly, with
    // the fix, rather than letting a confusing id error stand in for it.
    for (const child of [
      ...(Array.isArray(entry.steps) ? entry.steps : []),
      ...(entry.step && typeof entry.step === "object" ? [entry.step] : []),
    ]) {
      const childType = (child as SerializedEntry)?.type;
      if (
        typeof childType === "string" &&
        CONTAINER_ENTRY_TYPES.has(childType)
      ) {
        issues.push({
          code: "container-in-container",
          message: `a ${entry.type} can only hold single steps, not another ${childType} — lift the ${childType} out and put it before or after`,
          path,
          ...(id ? { entryId: id } : {}),
        });
      }
    }

    if (entry.type === "loop") {
      const loopType = typeof entry.loopType === "string" ? entry.loopType : "";
      if (loopType !== "dowhile" && loopType !== "dountil") {
        issues.push({
          code: "loop-without-condition",
          message: `a loop needs "loopType": "dowhile" (repeat while true) or "dountil" (repeat until true) — got ${
            loopType ? `"${loopType}"` : "nothing"
          }`,
          path,
          ...(id ? { entryId: id } : {}),
        });
      }
      // Without a predicate the loop has no exit — a closure predicate can't be
      // stored, so the declarative object is the only form that round-trips.
      if (!(entry.predicate && typeof entry.predicate === "object")) {
        issues.push({
          code: "loop-without-condition",
          message:
            'a loop needs a declarative "predicate" object, or it can never stop',
          path,
          ...(id ? { entryId: id } : {}),
        });
      }
    }

    // `agent` entries are legal INPUT: the save/reconcile path rewrites each
    // into `mapping + run_specialist` (translate-agent-entries.ts) before the
    // graph is stored, so a stored graph never carries one. Validation runs
    // after translation and therefore sees only the translated form.

    if (entry.type === "tool") {
      const toolId = typeof entry.toolId === "string" ? entry.toolId : "";
      if (!isGraphActionPrimitiveId(toolId)) {
        issues.push({
          code: "unknown-tool",
          message: `tool "${toolId}" is not a graph primitive — graphs may only reference ${GRAPH_ACTION_PRIMITIVE_IDS.join(", ")}`,
          path,
          ...(id ? { entryId: id } : {}),
        });
      }

      const constants = constantsFromMapping(previous ?? {});

      if (toolId === ENGENTY_TOOL_PRIMITIVE_ID) {
        const operationId = constants?.tool_id;
        if (typeof operationId !== "string" || !operationId.trim()) {
          issues.push({
            code: "dynamic-tool-id",
            message:
              "engenty_tool needs a constant `tool_id` from the mapping directly before it — a computed operation id cannot be capability-checked",
            path,
            ...(id ? { entryId: id } : {}),
          });
        } else if (options.holdsCapability && options.capabilityForOperation) {
          const required = options.capabilityForOperation(operationId);
          if (required && !options.holdsCapability(required)) {
            issues.push({
              code: "capability-missing",
              message: `this graph calls "${operationId}", which needs "${required}" — you don't hold it`,
              path,
              ...(id ? { entryId: id } : {}),
            });
          }
        }
      }

      if (toolId === RUN_SPECIALIST_PRIMITIVE_ID) {
        const agentKey = constants?.agent_type_key;
        if (typeof agentKey !== "string" || !agentKey.trim()) {
          issues.push({
            code: "dynamic-agent-key",
            message:
              "run_specialist needs a constant `agent_type_key` from the mapping directly before it",
            path,
            ...(id ? { entryId: id } : {}),
          });
        }
        // Mastra's schema flow sees only this primitive's static envelope, so
        // a node that feeds anything downstream must declare its own output
        // shape for the engenty-side flow check to have something to work with.
        //
        // A node with nothing downstream has nothing to type-check, and demanding
        // a schema there is not free: `output_schema` puts the agent under a
        // "respond with ONLY a JSON object" contract, so requiring it would make
        // "end by having an agent answer in prose" unexpressible — which is
        // exactly what a Workflow compiled to a one-node flow is (Phase 7 #4).
        // The exemption is deliberately the LAST entry of the top-level spine
        // only: inside a branch or container, "what comes after" depends on the
        // container, so those stay fail-closed.
        const isLastTopLevelEntry = path === `graph.${def.graph.length - 1}`;
        if (!(constants?.output_schema || isLastTopLevelEntry)) {
          issues.push({
            code: "missing-output-schema",
            message:
              "run_specialist needs a constant `output_schema` so downstream nodes can be type-checked across the agent (only the graph's last step may go without one)",
            path,
            ...(id ? { entryId: id } : {}),
          });
        }
      }

      if (toolId === WAIT_UNTIL_PRIMITIVE_ID) {
        // Same constant-arguments rule as every other primitive, and for the
        // same reason: a wake time computed at run time can't be read off the
        // canvas, so nobody reviewing the flow could tell how long it parks.
        const until = constants?.until;
        const durationMs = constants?.duration_ms;
        const hasUntil = typeof until === "string" && until.trim().length > 0;
        const hasDuration =
          typeof durationMs === "number" &&
          Number.isFinite(durationMs) &&
          durationMs > 0;
        if (!(hasUntil || hasDuration)) {
          issues.push({
            code: "wait-without-time",
            message:
              "wait_until needs a constant `until` (ISO date) or `duration_ms` from the mapping directly before it",
            path,
            ...(id ? { entryId: id } : {}),
          });
        } else if (hasUntil && Number.isNaN(new Date(until).getTime())) {
          issues.push({
            code: "wait-without-time",
            message: `wait_until's \`until\` is not a valid ISO date: "${until}"`,
            path,
            ...(id ? { entryId: id } : {}),
          });
        }
      }

      if (toolId === SHOW_UI_PRIMITIVE_ID) {
        // A node's surface is STORED json, so the catalog and size checks the
        // agent tool runs before anything reaches a user have to run here too:
        // an oversized surface should be a problem badge on the canvas, not a
        // run that dies at step 7.
        const components = constants?.components;
        if (Array.isArray(components)) {
          const componentIssues = validateEngentyA2uiComponents(
            components as Record<string, unknown>[]
          );
          const payloadBytes = Buffer.byteLength(
            JSON.stringify({ components, data: constants?.data }),
            "utf8"
          );
          if (componentIssues.length > 0) {
            issues.push({
              code: "invalid-ui-surface",
              message: `show_ui: ${componentIssues
                .slice(0, 3)
                .map((issue) => String(issue.message ?? issue))
                .join("; ")}`,
              path,
              ...(id ? { entryId: id } : {}),
            });
          } else if (payloadBytes > MAX_UI_PAYLOAD_BYTES) {
            issues.push({
              code: "invalid-ui-surface",
              message: `show_ui: the surface is ${payloadBytes} bytes; the limit is ${MAX_UI_PAYLOAD_BYTES}. Compose a smaller one.`,
              path,
              ...(id ? { entryId: id } : {}),
            });
          }
        } else {
          issues.push({
            code: "invalid-ui-surface",
            message:
              "show_ui needs a constant `components` array from the mapping directly before it",
            path,
            ...(id ? { entryId: id } : {}),
          });
        }
      }

      if (toolId === ARTIFACT_WRITE_PRIMITIVE_ID) {
        // The write refuses an unknown type at run time; catching it at save
        // time is the difference between a canvas badge and a failed run.
        const type = constants?.type;
        if (
          typeof type === "string" &&
          !(ARTIFACT_TYPE_IDS as readonly string[]).includes(type)
        ) {
          issues.push({
            code: "unknown-artifact-type",
            message: `artifact_write: "${type}" is not an artifact type — use one of ${ARTIFACT_TYPE_IDS.join(", ")}`,
            path,
            ...(id ? { entryId: id } : {}),
          });
        }
      }

      if (toolId === APPROVAL_GATE_PRIMITIVE_ID && inForeach) {
        // N concurrent suspensions of one gate node have no coherent resume
        // semantics in v1 (see the plan's open question 2). Reject rather than
        // ship something whose behavior nobody can predict from the canvas.
        issues.push({
          code: "gate-in-foreach",
          message:
            "an approval gate cannot run inside a foreach — split the loop so the human decides once",
          path,
          ...(id ? { entryId: id } : {}),
        });
      }
    }

    if (entry.type === "sleep" || entry.type === "sleepUntil") {
      const duration =
        typeof entry.duration === "number" ? entry.duration : undefined;
      const until = entry.date
        ? new Date(entry.date as string).getTime() - Date.now()
        : undefined;
      const waitMs = duration ?? until;
      if (typeof waitMs === "number" && waitMs > MAX_SLEEP_MS) {
        issues.push({
          code: "sleep-too-long",
          message:
            "a sleep longer than 15 minutes is held open by a live process and lost on the next restart. Use a wait_until node instead — it suspends the run durably and the wake sweep resumes it.",
          path,
          ...(id ? { entryId: id } : {}),
        });
      }
    }

    // 3. No graph may assert the run's identity.
    const constants = constantsFromMapping(entry);
    for (const key of Object.keys(constants ?? {})) {
      if (FORBIDDEN_GRAPH_KEYS.has(key)) {
        issues.push({
          code: "tenant-identity-in-graph",
          message: `"${key}" is run identity and comes from the request context — a graph may not set it`,
          path,
          ...(id ? { entryId: id } : {}),
        });
      }
    }
  }

  return issues;
}

/** Throwing presentation for the save path. */
export function assertValidGraphAction(
  def: GraphWorkflowDefinition,
  options: ValidateGraphActionOptions = {}
): void {
  const issues = validateGraphAction(def, options);
  if (issues.length > 0) {
    throw new Error(
      `graph-action: ${issues.length} validation issue(s)\n${issues
        .map((issue) => `  - [${issue.code}] ${issue.path}: ${issue.message}`)
        .join("\n")}`
    );
  }
}
