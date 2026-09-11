// The bridge between what is stored and what is drawn.
//
// Stored form: a Mastra `StoredWorkflowGraph` — a flat, ordered list of entries
// where a designer "node" is usually TWO entries (a mapping that supplies the
// constant arguments, then the tool entry that consumes them). Drawn form: one
// node per user-meaningful step, because nobody wants to see the plumbing.
//
// Positions are NOT persisted: graphs arrive from the LLM position-less, so
// layout is derived every time. That keeps the stored JSON canonical — two
// graphs that behave the same are byte-identical — and means a graph authored
// in chat looks exactly as good as one dragged by hand.

/** Serialized entry as it appears in the stored graph. */
export interface StoredEntry {
  id?: string;
  type?: string;
  [key: string]: unknown;
}

/** A Mastra `DynamicWorkflowGraph`, every field it defines. */
export interface StoredGraph {
  description?: string;
  graph: StoredEntry[];
  id: string;
  inputSchema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  requestContextSchema?: Record<string, unknown>;
  stateSchema?: Record<string, unknown>;
}

/** What the user sees as one step. */
export type CanvasNodeKind =
  | "agent"
  | "tool"
  | "gate"
  | "apply"
  | "artifact"
  | "render"
  | "transform"
  | "branch"
  | "loop"
  | "wait"
  | "subaction"
  | "parallel"
  // The graph's CONTRACT, drawn as nodes when a host opts in: what a press
  // must provide, and the shape the settled result must match.
  | "input"
  | "output"
  | "unknown";

export interface CanvasNodeData {
  /** Constants the preceding mapping supplies — the node's real arguments. */
  args: Record<string, unknown>;
  /** Index of this node's branch within its container. Undefined on the spine. */
  childIndex?: number;
  /**
   * Overrides the kind chip. `foreach` and `loop` share one kind but mean
   * different things, and one static label per kind made a loop announce
   * itself as "For each".
   */
  chip?: string;
  /** Stored entry ids this node owns — used to map issues + run state back. */
  entryIds: string[];
  /** Index of the entry in the stored graph (the mapping, when there is one). */
  entryIndex: number;
  kind: CanvasNodeKind;
  /** Position in the top-to-bottom flow. Drives layout regrouping. */
  segmentIndex?: number;
  /** One-line summary rendered under the title. */
  subtitle?: string;
  title: string;
  [key: string]: unknown;
}

export interface CanvasNode {
  data: CanvasNodeData;
  id: string;
  position: { x: number; y: number };
  type: "step";
}

export interface CanvasEdge {
  id: string;
  /** Branch label ("status ≠ paid") when the edge leaves a conditional. */
  label?: string;
  source: string;
  target: string;
  /** `back` is a loop's return edge — drawn dashed, curving up to the header. */
  variant?: "back";
}

const PRIMITIVE_KIND: Record<string, CanvasNodeKind> = {
  apply_field_updates: "apply",
  approval_gate: "gate",
  artifact_read: "artifact",
  artifact_write: "artifact",
  engenty_tool: "tool",
  run_specialist: "agent",
  show_artifact: "artifact",
  show_objects: "render",
  show_ui: "render",
  wait_until: "wait",
};

/** Human label for a node with no better name available. */
const KIND_LABEL: Record<CanvasNodeKind, string> = {
  agent: "Agent",
  apply: "Apply updates",
  artifact: "Artifact",
  branch: "Branch",
  gate: "Approval",
  input: "Input",
  loop: "For each",
  output: "Result",
  parallel: "In parallel",
  render: "Show",
  subaction: "Workflow",
  tool: "Tool",
  transform: "Transform",
  unknown: "Step",
  wait: "Wait",
};

/**
 * The two contract ends carry fixed ids rather than entry ids — they are not
 * steps. Selecting one opens the editor for THAT end instead of the step
 * inspector, which is what makes the drawn node and the form one thing.
 */
export function contractSideForNodeId(
  id: string | null | undefined
): "input" | "output" | null {
  if (id === "__input") {
    return "input";
  }
  if (id === "__output") {
    return "output";
  }
  return null;
}

/** Subtitle for a contract end with nothing declared. */
const EMPTY_CONTRACT: Record<"input" | "output", string> = {
  input: "No parameters",
  output: "No declared result",
};

/**
 * A mapping entry's arguments, made readable — the arguments ARE what the
 * step does, so every source kind renders: a `{ value }` constant as itself,
 * a `{ template }` as its text (an agent step's brief usually lives here),
 * and a `{ step, path }` / init-data reference as a plain "from …" line.
 */
export function mappingConstants(
  entry: StoredEntry | undefined
): Record<string, unknown> {
  if (entry?.type !== "mapping" || typeof entry.mapConfig !== "string") {
    return {};
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(entry.mapConfig) as Record<string, unknown>;
  } catch {
    return {};
  }
  const args: Record<string, unknown> = {};
  for (const [key, source] of Object.entries(parsed)) {
    // Internal markers (`__engenty_agent_entry`) are plumbing, not meaning.
    if (key.startsWith("__") || !source || typeof source !== "object") {
      continue;
    }
    const src = source as {
      initData?: boolean;
      path?: unknown;
      step?: unknown;
      template?: unknown;
      value?: unknown;
    };
    if ("value" in src) {
      args[key] = src.value;
      continue;
    }
    if (typeof src.template === "string") {
      args[key] = src.template;
      continue;
    }
    const path = typeof src.path === "string" ? src.path : "";
    if (typeof src.step === "string" && src.step) {
      args[key] = `← ${src.step}${path ? ` · ${path}` : ""}`;
      continue;
    }
    if (src.initData || "path" in src) {
      args[key] = path ? `← run input · ${path}` : "← run input";
    }
  }
  return args;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Readable summary of a declarative predicate, for a branch node's chip.
 *
 * Follows Mastra's predicate DSL exactly: `and`/`or` nest under `args`, `not`
 * under `arg`, and every operand is a `{ path }` or `{ literal }` wrapper
 * rather than a bare value. Reading the wrong field doesn't fail loudly — it
 * silently renders a branch with no label, which is worse than a wrong one
 * because the canvas then looks like the branch has no condition at all.
 */
function describeOperand(operand: unknown): string | undefined {
  if (!operand || typeof operand !== "object") {
    return;
  }
  const node = operand as { literal?: unknown; path?: unknown };
  const path = asString(node.path);
  if (path) {
    // `stepResults.approval1.approved` reads as `approval1.approved` — the root
    // is the same on every predicate, so it's noise on a small chip.
    return path.replace(/^(initData|inputData|state|stepResults)\./, "");
  }
  return "literal" in node ? JSON.stringify(node.literal) : undefined;
}

export function describePredicate(predicate: unknown): string | undefined {
  if (!predicate || typeof predicate !== "object") {
    return;
  }
  const node = predicate as Record<string, unknown>;
  const op = asString(node.op);
  if (!op) {
    return;
  }
  if (op === "and" || op === "or") {
    const parts = Array.isArray(node.args)
      ? node.args.map(describePredicate).filter(Boolean)
      : [];
    return parts.length ? parts.join(op === "and" ? " and " : " or ") : op;
  }
  if (op === "not") {
    const inner = describePredicate(node.arg);
    return inner ? `not ${inner}` : "not";
  }
  if (op === "exists" || op === "notExists") {
    const path = asString(node.path);
    return path ? `${path} ${op === "exists" ? "is set" : "is not set"}` : op;
  }
  if (op === "truthy" || op === "falsy") {
    const value = describeOperand(node.value);
    return value ? `${value} is ${op}` : op;
  }
  if (op === "in" || op === "notIn") {
    const value = describeOperand(node.value);
    const set = Array.isArray(node.set) ? node.set.join(", ") : "";
    return value ? `${value} ${op === "in" ? "in" : "not in"} [${set}]` : op;
  }
  const left = describeOperand(node.left);
  const right = describeOperand(node.right);
  const symbol =
    { eq: "=", gt: ">", gte: "≥", lt: "<", lte: "≤", ne: "≠" }[op] ?? op;
  return left ? `${left} ${symbol} ${right ?? ""}`.trim() : undefined;
}

/** The container entries whose children are drawn INSIDE them. */
const CONTAINER_TYPES = new Set(["conditional", "foreach", "loop", "parallel"]);

/** Children of a container, in draw order. Alternatives for conditional/parallel. */
function childEntriesOf(entry: StoredEntry): StoredEntry[] {
  if (Array.isArray(entry.steps)) {
    return entry.steps.filter(
      (child): child is StoredEntry =>
        Boolean(child) && typeof child === "object"
    );
  }
  if (entry.step && typeof entry.step === "object") {
    return [entry.step as StoredEntry];
  }
  return [];
}

/**
 * Build the node for one entry, given the constants feeding it.
 *
 * A child of a container gets its constants from the mapping BEFORE the
 * container — the same rule the save-path validator applies, and the reason a
 * branch's tool node can be titled "Send invoice" rather than a bare "Tool".
 */
function nodeForEntry(input: {
  args: Record<string, unknown>;
  childIndex?: number;
  entry: StoredEntry;
  entryIds?: string[];
  fallbackId: string;
  index: number;
  segmentIndex: number;
}): CanvasNode {
  const { args, entry } = input;
  const kind = kindForEntry(entry);
  return {
    data: {
      args,
      entryIds:
        input.entryIds ?? (asString(entry.id) ? [entry.id as string] : []),
      entryIndex: input.index,
      kind,
      segmentIndex: input.segmentIndex,
      title: titleForNode(kind, args, entry),
      ...(input.childIndex === undefined
        ? {}
        : { childIndex: input.childIndex }),
      ...(kind === "loop"
        ? { chip: entry.type === "foreach" ? "For each" : "Repeat" }
        : {}),
      ...(subtitleForNode(kind, args, entry)
        ? { subtitle: subtitleForNode(kind, args, entry) }
        : {}),
    },
    id: asString(entry.id) ?? input.fallbackId,
    position: { x: 0, y: 0 },
    type: "step",
  };
}

/** One position in the top-to-bottom flow: a step, or a container plus its branches. */
interface CanvasSegment {
  /** Branch bodies, laid out in a row under the container. */
  children: CanvasNode[];
  /** True for `loop` — draws the return edge back up to the header. */
  isLoop: boolean;
  /** Per-branch predicate, by child index. Conditionals only. */
  labels: (string | undefined)[];
  node: CanvasNode;
}

/**
 * Collapse the stored entry list into drawable nodes and edges.
 *
 * Two rules do the work:
 *
 * 1. **mapping + tool is ONE node.** The mapping supplies the tool's constant
 *    arguments, so showing them separately would put the plumbing on screen.
 *    A mapping not followed by a tool is a real Transform step.
 *
 * 2. **A container FORKS.** A conditional/parallel/foreach/loop draws its
 *    branches as a row beneath it, with an edge out to each one and an edge
 *    from each one down into whatever comes next. Enclosing them in a frame
 *    instead — the obvious first idea — puts the branches on screen but not the
 *    branching: no split, no merge, just two cards in a box. The fork and the
 *    join ARE the meaning, so they have to be drawn.
 *
 *    A conditional labels each outgoing edge with that branch's predicate. A
 *    loop additionally draws a dashed edge from its body back up to itself,
 *    which is the only thing on the canvas that says "this repeats".
 */
export function storedGraphToCanvas(
  stored: StoredGraph,
  options?: {
    /**
     * Draw the graph's CONTRACT as first/last nodes: the input schema a press
     * must satisfy, and the output schema the settled result is checked
     * against. Opt-in — the routine spine and run overlays draw steps only.
     */
    contract?: boolean;
  }
): {
  edges: CanvasEdge[];
  nodes: CanvasNode[];
} {
  const segments: CanvasSegment[] = [];
  const entries = stored.graph ?? [];
  let previous: StoredEntry | undefined;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    const next = entries[index + 1];
    const segmentIndex = segments.length;

    // Rule 1: mapping + tool → one node.
    if (entry.type === "mapping" && next?.type === "tool") {
      segments.push({
        children: [],
        isLoop: false,
        labels: [],
        node: nodeForEntry({
          args: mappingConstants(entry),
          entry: next,
          entryIds: [
            ...(asString(entry.id) ? [entry.id as string] : []),
            ...(asString(next.id) ? [next.id as string] : []),
          ],
          fallbackId: `node-${index}`,
          index,
          segmentIndex,
        }),
      });
      previous = next;
      index += 1;
      continue;
    }

    const args = entry.type === "mapping" ? mappingConstants(entry) : {};
    const container = nodeForEntry({
      args,
      entry,
      fallbackId: `node-${index}`,
      index,
      segmentIndex,
    });

    // Rule 2: fork.
    const children: CanvasNode[] = [];
    const labels: (string | undefined)[] = [];
    if (CONTAINER_TYPES.has(String(entry.type))) {
      // Constants reach a branch from before the container, not from the
      // container itself — branches are entered with the container's input.
      const inherited = mappingConstants(previous);
      const predicates = Array.isArray(entry.predicates)
        ? entry.predicates
        : [];
      for (const [childIndex, child] of childEntriesOf(entry).entries()) {
        children.push(
          nodeForEntry({
            args:
              child.type === "mapping" ? mappingConstants(child) : inherited,
            childIndex,
            entry: child,
            fallbackId: `${container.id}-branch-${childIndex}`,
            index,
            segmentIndex,
          })
        );
        labels.push(
          entry.type === "conditional"
            ? describePredicate(predicates[childIndex])
            : undefined
        );
      }
    }

    segments.push({
      children,
      isLoop: entry.type === "loop",
      labels,
      node: container,
    });
    previous = entry;
  }

  const edges: CanvasEdge[] = [];
  for (const [index, segment] of segments.entries()) {
    const nextNode = segments[index + 1]?.node;

    if (segment.children.length === 0) {
      if (nextNode) {
        edges.push({
          id: `${segment.node.id}->${nextNode.id}`,
          source: segment.node.id,
          target: nextNode.id,
        });
      }
      continue;
    }

    for (const [childIndex, child] of segment.children.entries()) {
      const label = segment.labels[childIndex];
      edges.push({
        id: `${segment.node.id}->${child.id}`,
        source: segment.node.id,
        target: child.id,
        ...(label ? { label } : {}),
      });
      // The join. Every branch flows into whatever follows the container —
      // that's what makes the fork read as a fork rather than a dead end.
      if (nextNode) {
        edges.push({
          id: `${child.id}->${nextNode.id}`,
          source: child.id,
          target: nextNode.id,
        });
      }
      if (segment.isLoop) {
        edges.push({
          id: `${child.id}->${segment.node.id}-back`,
          source: child.id,
          target: segment.node.id,
          variant: "back",
        });
      }
    }
  }

  const nodes = segments.flatMap((segment) => [
    segment.node,
    ...segment.children,
  ]);

  if (options?.contract) {
    const contractNode = (
      kind: "input" | "output",
      schema: Record<string, unknown>,
      segmentIndex: number
    ): CanvasNode => {
      const keys = Object.keys(
        (schema.properties as Record<string, unknown> | undefined) ?? {}
      );
      return {
        data: {
          args: { schema },
          entryIds: [],
          entryIndex: kind === "input" ? -1 : entries.length,
          kind,
          segmentIndex,
          subtitle: keys.length > 0 ? keys.join(", ") : EMPTY_CONTRACT[kind],
          title: KIND_LABEL[kind],
        },
        id: `__${kind}`,
        position: { x: 0, y: 0 },
        type: "step",
      };
    };
    const first = segments[0];
    const last = segments.at(-1);
    // Both ends are always drawn. An Action that declares nothing still HAS a
    // contract — "takes nothing, promises nothing" is a statement about it —
    // and the empty node is where you go to say otherwise.
    nodes.unshift(contractNode("input", stored.inputSchema ?? {}, -1));
    nodes.push(
      contractNode("output", stored.outputSchema ?? {}, segments.length)
    );
    if (first) {
      edges.push({
        id: `__input->${first.node.id}`,
        source: "__input",
        target: first.node.id,
      });
    }
    // A fork's arms are what flows onward, so they feed the result node; a
    // plain last step feeds it directly. With no steps at all the two ends
    // meet, which draws the contract of an Action nobody has filled in yet.
    const sources = last
      ? last.children.length > 0
        ? last.children.map((child) => child.id)
        : [last.node.id]
      : ["__input"];
    for (const source of sources) {
      edges.push({
        id: `${source}->__output`,
        source,
        target: "__output",
      });
    }
  }

  return { edges, nodes: layoutCanvas(nodes) };
}

function kindForEntry(entry: StoredEntry): CanvasNodeKind {
  switch (entry.type) {
    case "tool":
      return PRIMITIVE_KIND[asString(entry.toolId) ?? ""] ?? "unknown";
    case "mapping":
      return "transform";
    case "conditional":
      return "branch";
    case "foreach":
    case "loop":
      return "loop";
    case "sleep":
    case "sleepUntil":
      return "wait";
    case "workflow":
      return "subaction";
    case "parallel":
      return "parallel";
    case "agent":
      // Only reachable on a graph that predates the run_specialist rule; the
      // validator rejects these, so it renders as a problem node.
      return "unknown";
    default:
      return "unknown";
  }
}

/**
 * `"invoices_send"` → `"Send invoice"`. Operation ids are `<module>_<verb>`, and
 * the module is already shown as the node's context — leading with the verb is
 * what makes a flow read like a sentence instead of a config file.
 */
export function humanizeOperationId(operationId: string): string {
  const [moduleId, ...rest] = operationId.split("_");
  if (!(moduleId && rest.length > 0)) {
    return operationId;
  }
  const verb = rest.join(" ");
  // Singularize the module for the object: "invoices send" → "Send invoice".
  const object = moduleId.endsWith("s") ? moduleId.slice(0, -1) : moduleId;
  const sentence = `${verb} ${object}`.replace(/[-_]/g, " ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function titleForNode(
  kind: CanvasNodeKind,
  args: Record<string, unknown>,
  entry?: StoredEntry
): string {
  switch (kind) {
    case "agent":
      return asString(args.agent_type_key) ?? KIND_LABEL.agent;
    case "tool": {
      const toolId = asString(args.tool_id);
      return toolId ? humanizeOperationId(toolId) : KIND_LABEL.tool;
    }
    case "gate":
      return asString(args.title) ?? KIND_LABEL.gate;
    case "wait": {
      // Two sources: a `wait_until` node carries its time as mapping constants
      // (durable, any length), a raw sleep/sleepUntil entry carries it on the
      // entry itself (capped at MAX_SLEEP_MS). Both read the same on the canvas
      // — the difference is durability, not intent.
      const until = asString(args.until) ?? (entry?.date as string | undefined);
      if (until) {
        return `Wait until ${new Date(until).toLocaleString()}`;
      }
      const duration =
        typeof args.duration_ms === "number"
          ? args.duration_ms
          : entry?.duration;
      return typeof duration === "number"
        ? `Wait ${formatDuration(duration)}`
        : KIND_LABEL.wait;
    }
    case "loop":
      // Both `foreach` and `loop` render as this kind, but they mean different
      // things — "once per item" versus "repeat until".
      return entry?.type === "foreach" ? "For each" : "Repeat";
    case "subaction":
      return asString(entry?.workflowId) ?? KIND_LABEL.subaction;
    default:
      return KIND_LABEL[kind];
  }
}

function subtitleForNode(
  kind: CanvasNodeKind,
  args: Record<string, unknown>,
  entry?: StoredEntry
): string | undefined {
  switch (kind) {
    case "agent":
      return asString(args.brief);
    case "tool":
      // The raw operation id, since the title is now the humanized form. Keeps
      // the exact call visible without making it the headline.
      return asString(args.tool_id);
    case "gate":
      return asString(args.kind) === "field_updates"
        ? "Review proposed changes"
        : "Needs a human decision";
    case "apply":
      return "Write approved changes to the subject";
    case "artifact":
      return asString(args.title) ?? asString(args.artifact_id);
    case "render":
      // What is on screen, in the author's own words when they gave one.
      return (
        asString(args.title) ??
        (Array.isArray(args.refs)
          ? `${args.refs.length} record${args.refs.length === 1 ? "" : "s"}`
          : undefined)
      );
    case "wait":
      // The author's own words for why the flow pauses here — the one thing
      // someone finding a parked run actually wants to read.
      return asString(args.reason);
    case "branch": {
      // Each branch now carries its own predicate as a caption inside the
      // frame, so repeating them all here would say the same thing twice. What
      // the header adds is the semantics people get wrong: a conditional runs
      // EVERY matching branch, not the first one.
      const count = Array.isArray(entry?.steps) ? entry.steps.length : 0;
      return count > 0
        ? `Runs every matching branch (${count})`
        : "Runs every branch whose condition is true";
    }
    case "parallel": {
      const count = Array.isArray(entry?.steps) ? entry.steps.length : 0;
      return count > 0 ? `${count} steps, concurrently` : "Runs concurrently";
    }
    case "loop": {
      if (entry?.type === "foreach") {
        const concurrency = (entry.opts as { concurrency?: unknown })
          ?.concurrency;
        return typeof concurrency === "number" && concurrency > 1
          ? `Once per item, ${concurrency} at a time`
          : "Once per item";
      }
      const until = entry?.loopType === "dountil";
      const condition = describePredicate(entry?.predicate);
      return condition
        ? `Repeats ${until ? "until" : "while"} ${condition}`
        : "Repeats";
    }
    case "transform": {
      const keys = Object.keys(args);
      return keys.length ? `Sets ${keys.join(", ")}` : "Reshape data";
    }
    default:
      return;
  }
}

function formatDuration(ms: number): string {
  if (ms >= 86_400_000) {
    return `${Math.round(ms / 86_400_000)}d`;
  }
  if (ms >= 3_600_000) {
    return `${Math.round(ms / 3_600_000)}h`;
  }
  if (ms >= 60_000) {
    return `${Math.round(ms / 60_000)}m`;
  }
  return `${Math.round(ms / 1000)}s`;
}

const NODE_WIDTH = 260;
/** Icon row + title, with no subtitle and no problems. */
const NODE_BASE_HEIGHT = 46;
const SUBTITLE_HEIGHT = 26;
const PROBLEM_ROW_HEIGHT = 30;
/** Vertical breathing room between stacked nodes. */
export const LAYOUT_GAP_Y = 44;

/**
 * Estimated rendered height. Layout has to run before React Flow measures
 * anything, and a node grows when it carries a subtitle or problem badges —
 * assuming a uniform height makes tall nodes overlap the ones below them.
 * Overestimating slightly is the safe direction: extra whitespace reads fine,
 * overlap does not.
 */
export function estimateNodeHeight(
  data: Pick<CanvasNodeData, "subtitle"> & { problems?: unknown[] }
): number {
  const problems = data.problems?.length ?? 0;
  return (
    NODE_BASE_HEIGHT +
    (data.subtitle ? SUBTITLE_HEIGHT : 0) +
    (problems > 0 ? 16 + problems * PROBLEM_ROW_HEIGHT : 0)
  );
}

/** Horizontal gap between branch alternatives. */
const CHILD_GAP_X = 36;
/** Shorter gap between a container and its branch row — they belong together. */
const FORK_GAP_Y = 30;

/**
 * Vertical flow layout with forks.
 *
 * Deliberately simple: engenty graphs are mostly a straight line, and a
 * predictable top-to-bottom flow reads faster than a clever layout that moves
 * every time an edge changes. The one departure is a container, whose branches
 * sit in a ROW beneath it — side by side because they are alternatives, and
 * stacking them vertically would read as a sequence, which is the opposite of
 * what a conditional means.
 *
 * Everything is centred on one axis so the spine stays a straight line and a
 * fork visibly widens away from it and comes back.
 *
 * Regroups from `data.segmentIndex` / `data.childIndex` rather than taking a
 * pre-grouped structure, so the canvas can re-run this with MEASURED heights
 * once React Flow has rendered — same function, same result, better numbers.
 */
export function layoutCanvas(
  nodes: CanvasNode[],
  heightFor: (node: CanvasNode) => number = (node) =>
    estimateNodeHeight(node.data)
): CanvasNode[] {
  const segments = new Map<
    number,
    { children: CanvasNode[]; spine?: CanvasNode }
  >();
  for (const node of nodes) {
    const key = (node.data.segmentIndex as number | undefined) ?? 0;
    const segment = segments.get(key) ?? { children: [] };
    if (node.data.childIndex === undefined) {
      segment.spine = node;
    } else {
      segment.children.push(node);
    }
    segments.set(key, segment);
  }

  const ordered = [...segments.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, segment]) => segment);
  for (const segment of ordered) {
    segment.children.sort(
      (a, b) =>
        ((a.data.childIndex as number) ?? 0) -
        ((b.data.childIndex as number) ?? 0)
    );
  }

  const rowWidth = (count: number) =>
    count > 0 ? count * NODE_WIDTH + (count - 1) * CHILD_GAP_X : NODE_WIDTH;
  const widest = Math.max(
    NODE_WIDTH,
    ...ordered.map((segment) => rowWidth(segment.children.length))
  );
  const centre = widest / 2;

  const positioned: CanvasNode[] = [];
  let y = 0;

  for (const segment of ordered) {
    if (segment.spine) {
      positioned.push({
        ...segment.spine,
        position: { x: centre - NODE_WIDTH / 2, y },
      });
      y +=
        heightFor(segment.spine) +
        (segment.children.length > 0 ? FORK_GAP_Y : LAYOUT_GAP_Y);
    }

    if (segment.children.length > 0) {
      let x = centre - rowWidth(segment.children.length) / 2;
      let tallest = 0;
      for (const child of segment.children) {
        positioned.push({ ...child, position: { x, y } });
        x += NODE_WIDTH + CHILD_GAP_X;
        tallest = Math.max(tallest, heightFor(child));
      }
      y += tallest + LAYOUT_GAP_Y;
    }
  }

  return positioned;
}

export const CANVAS_NODE_WIDTH = NODE_WIDTH;
