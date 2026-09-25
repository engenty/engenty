// How to write a graph, described for a model.
//
// Two consumers author graphs: `workflow_propose` (the conversational path
// — a user describes the steps in chat) and `draft-from-description` (the create
// dialog — a user describes it in a form). They must teach the same rules, so
// the text lives here rather than in either one. A second copy would drift, and
// a drifted copy means a model that writes graphs the validator rejects for
// reasons its instructions never mentioned.
//
// Dependency-free on purpose, same as `primitive-ids.ts`: the propose tool
// imports the validator, so anything the validator's neighbourhood imports has
// to stay a leaf or the module-init cycle comes back.

/**
 * Deliberately verbose on the rules that are impossible to guess and fatal to
 * get wrong: only the listed primitives may be referenced, each one's governing
 * arguments must arrive as `{ value: … }` constants from the mapping
 * immediately before it, and a long wait must be a `wait_until` node rather
 * than a sleep.
 */
export const GRAPH_GUIDANCE = `
You are writing a Mastra dynamic workflow graph. Assume you know NOTHING about
this format beyond what follows — do not carry over field names or shapes from
other workflow systems (n8n, Temporal, LangGraph, GitHub Actions). Only the
entry types and fields described here exist.

A graph is an ordered list of entries. A user-visible step is normally TWO
entries: a "mapping" that supplies constant arguments, then a "tool" entry that
consumes them.

THE ENTRY SHAPE IS FIXED. A tool step is ALWAYS
  { "type": "tool", "id": "send", "toolId": "engenty_tool" }
The tool's name goes in "toolId"; "type" is the literal string "tool" and
nothing else. Do NOT write { "type": "engenty_tool" }, do not add an "args"
field, and do not invent entry types — a tool entry takes its input from the
mapping before it, which is the ONLY way arguments reach it.

So a complete step is exactly two entries:
  { "type": "mapping", "id": "prep-send",
    "mapConfig": "{\\"tool_id\\":{\\"value\\":\\"invoices_send\\"}}" },
  { "type": "tool", "id": "send", "toolId": "engenty_tool" }

MAPCONFIG IS A JSON *STRING*, NOT AN OBJECT. This is the single most common
mistake. WRONG: "mapConfig": { "tool_id": { "value": "x" } } — an object here
fails validation twice over (the config is unreadable AND every constant it
was supposed to supply counts as missing). RIGHT: the same object serialized
into one string, with escaped quotes, as in the example above. Inside that
string:
  · each key takes exactly ONE of these FIVE sources:
      {"value": <constant>}                      — a literal
      {"initData": true, "path": "contact_id"}   — from the run's input
      {"step": "earlier-id", "path": "summary"}  — from an earlier step
      {"requestContextPath": "space.key"}        — from the run's request
        context, which the caller sets when the run starts and no step can
        write. Use it for who/where the run is happening, never for data a
        step produced.
      {"template": "Hi \${initData.name}"}       — string interpolation;
        placeholders are \${initData.<field>} or
        \${stepResults.<stepId>.<field>}, never {{...}}; interpolated objects
        and arrays are JSON-encoded automatically
    "initData" is the literal boolean true, and a source names initData OR a
    step, never both. "step" may only name a step id that appears BEFORE this
    mapping — the FIRST mapping in a graph has no earlier steps, so it may
    only use {"value"}, {"initData": true, "path"} and
    {"requestContextPath"} sources.
  · every "path" is plain dotted segments only — "customer.email" is valid;
    "items[0].email", "$.customer" and a trailing dot are not.

A complete run_specialist step, worked in full (copy this shape; the
output_schema lives in the mapping as a {value} constant, not on the tool entry
and not computed. It is REQUIRED whenever anything follows the agent step —
only the graph's LAST step may omit it, and then the agent answers in prose):
  { "type": "mapping", "id": "prep-summarize",
    "mapConfig": "{\\"agent_type_key\\":{\\"value\\":\\"contacts.manager\\"},\\"brief\\":{\\"value\\":\\"Summarize this client for the welcome email\\"},\\"contact_id\\":{\\"initData\\":true,\\"path\\":\\"contact_id\\"},\\"output_schema\\":{\\"value\\":{\\"type\\":\\"object\\",\\"properties\\":{\\"summary\\":{\\"type\\":\\"string\\"}},\\"required\\":[\\"summary\\"]}}}" },
  { "type": "tool", "id": "summarize", "toolId": "run_specialist" }

THE BRIEF IS THE STEP'S INSTRUCTION. The agent behind a run_specialist step
receives the brief and nothing else — it cannot see the graph, the other
steps, or why it was called. So every brief must state, in imperative words,
what THIS step's own job is. When a step works on an earlier step's output,
the brief is a {"template"} that carries the instruction AND interpolates the
data:
  "brief": {"template": "Cross-check these findings against independent
    sources and keep only what holds up:\\n\\n\${stepResults.research.findings}"}
NEVER wire a brief as a bare {"step": "…", "path": "…"} reference — that hands
the agent raw data with no instruction, and the step will guess its job.

Only these ten values are valid for "toolId":
  run_specialist      — run an agent. Constants: agent_type_key, brief,
                        output_schema (JSON Schema; required so later steps can
                        be type-checked across the agent — omit it only on the
                        graph's last step), optional allowed_tools, optional
                        thread_mode ("new" by default — the step gets its own
                        thread; use "reuse" ONLY when two agent steps must
                        share one conversation, and prefer carrying data
                        forward with a {template} over stepResults instead).
  engenty_tool        — call a module operation. Constant: tool_id (e.g.
                        "invoices_update"). Input usually maps from an earlier step.
  approval_gate       — pause for a human. Constants: kind ("confirm" |
                        "field_updates" | "choice" | "surface"), title, payload,
                        optional accepts_text (true lets free text typed beside
                        the step reach the run as event "utterance" +
                        data.utterance). For confirm/field_updates/choice put
                        the ACTUAL data the human is deciding on in payload
                        (amounts, recipients, field values) — not a restatement
                        of intent. kind "surface" is a whole page: payload =
                        { components, data } from the component catalog below,
                        with inputs bound into data ("value": {"path": "/x"})
                        and outputs (Document, Table, Markdown…) showing what
                        earlier steps produced. The gate resumes with
                        { approved, data, event, reason }: data is the page's
                        data model after the person edited it, event is the
                        Button they pressed ("next", "ok", "revise", …).
                        payload is LITERAL — a {"step"} source nested inside
                        payload.data is stored as-is, never resolved. To show
                        an earlier step's result on the page, map the
                        top-level key data ({"step": "carry", "path": ""}):
                        that object becomes the page's data model.
  pick_surface        — Jev chooses the next authored page. Constants: prompt
                        plus candidates [{ id, description, kind, payload,
                        title?, optional_fields? }]. Returns { gate_id, kind,
                        payload, surface, title } for the mapping that feeds
                        the following approval_gate. Never invent a page —
                        only pick among the authored candidates.
  apply_field_updates — write an approved patch to the run's subject. Normally
                        directly after a field_updates gate.
  wait_until          — park the run durably. Constants: either until (ISO
                        date) or duration_ms, plus an optional reason shown on
                        the canvas ("waiting for the customer to reply").
  artifact_write      — produce a deliverable the person can open and download.
                        Constants: title + type ("markdown", "html", "table"
                        for CSV, "app" / "file" / "database") to create;
                        artifact_id + expected_version to update. Content
                        usually maps from an earlier step.
  artifact_read       — read an artifact, mainly to get the expected_version an
                        update needs. Constant: artifact_id.
  show_artifact       — re-open an artifact the person cannot currently see.
                        Constant: artifact_id.
  show_ui             — draw a native surface in the chat from the engenty
                        component catalog. Constants: components (flat list,
                        exactly one entry with id "root"), optional data, title.
  show_objects        — show engenty records as cards. Constant: refs, e.g.
                        ["offers:offer:<id>"]. One record MAPPED from an
                        earlier step goes in "ref" instead, as a template:
                        {"ref":{"template":"offers:offer:\${stepResults.create.output.id}"}}
                        — a mapping cannot fill an element of an array.
                        Optional display ("inline" | "panel" | "expanded"),
                        title. A write step followed by show_objects is what
                        leaves a record of the run in the conversation.

A node RENDERS what is already known; an agent WRITES what has to be composed.
So: put an agent step before show_ui when the surface depends on judgment, and
use show_ui alone when the shape is fixed and only the data varies. Cards from
these nodes land in the owner's chat with this Workflow's specialist — the same
room a routine reports into — not in the run log.

CONTROL FLOW. These entry types need no tool. Use them — a Workflow that is
one straight line usually skipped a decision it should have made.
Each has a FIXED shape:

  { "type": "mapping", "id": "…", "mapConfig": "…" }
      Reshape data. Free, no model turn.

  { "type": "conditional",
    "steps": [ <one entry per branch> ],
    "predicates": [ <one predicate per branch, same order> ] }
      Runs EVERY branch whose predicate is true, concurrently. A container of
      branches, NOT an inline if — a conditional with no "steps" is invalid.
      Note: no "id" on this entry.

  { "type": "parallel", "steps": [ <entries> ] }
      Runs all of them concurrently and merges their outputs. No "id".

  { "type": "foreach", "step": <one entry>, "opts": { "concurrency": 1 } }
      Runs "step" once per item of the array coming in. Singular "step", not
      "steps". No "id". An approval_gate may NOT sit inside a foreach.

  { "type": "loop", "loopType": "dowhile", "step": <one entry>,
    "predicate": { … } }
      Repeats "step". "loopType" is exactly "dowhile" (repeat WHILE true) or
      "dountil" (repeat UNTIL true) — no other value is valid. No "id".

  { "type": "workflow", "id": "…", "graph": [ <entries> ] }
      An INLINE nested workflow: its own ordered entry list, mappings
      included, run as one step. This is how a container body gets several
      steps — a loop that drafts, writes and asks ("draft" → "write" →
      "review") is a loop whose "step" is one workflow entry holding those
      three. Its output is its LAST entry's output, so a predicate or a later
      mapping reads {"step": "<its id>", "path": "<field>"} — never a step
      inside it. Needs an "id"; "inputSchema"/"outputSchema" are optional.

CONTAINERS DO NOT NEST, AND HOLD NO MAPPINGS. Whatever goes in "steps" or
"step" must be a single tool or workflow entry WITH an "id". You cannot put a
parallel inside a conditional, or a conditional inside a foreach — lift the
inner one out and place it before or after. A body that needs more than one
step is an inline workflow entry (above).

A MAPPING MUST BE TOP-LEVEL. It is rejected inside "steps" or "step". This is
the rule that shapes every branching graph, because a tool normally gets its
constants from the mapping right before it and inside a container there is no
"before". So: put ONE mapping at the top level ahead of the container carrying
what the branches need, and let each branch's tool consume it. If two branches
need different constants, they cannot be branches of one container — write
them as a conditional whose branches are separate tools fed by separate
top-level mappings placed before it.

  { "type": "sleep", "id": "…", "duration": <ms> }
  { "type": "sleepUntil", "id": "…", "date": "<ISO>" }
      Short pauses only — see WAITING below.

PREDICATES (used by "conditional" and "loop"). Ops are eq/ne/lt/lte/gt/gte
(with "left" and "right"), in/notIn ("value" and "set"), exists/notExists
("path"), truthy/falsy ("value"), and/or ("args": [predicates]), not ("arg").
Every operand is either { "path": "…" } or { "literal": … } — never a bare
value. Paths start at initData, inputData, state, or stepResults.<stepId>,
and a stepResults path may only name a step that is TOP-LEVEL and earlier —
never one nested inside another container:
  { "op": "eq",
    "left": { "path": "stepResults.approval1.approved" },
    "right": { "literal": true } }

WAITING. Use wait_until for anything longer than a few minutes — "chase in 3
days", "follow up next Monday". A raw "sleep" is held open by a live process
and is rejected above 15 minutes; wait_until suspends the run instead, so it
survives restarts and deploys. Short pauses (a rate-limit backoff) can stay
"sleep".

HOW BIG SHOULD THE GRAPH BE? Match the shape to the job, and let the SIMPLEST
shape that does it win. A graph exists to make a run repeatable and inspectable
— every entry you add is another thing a human reads on the canvas and another
thing that can be wrong.

  One agent step, nothing else. The right answer far more often than it looks.
  If the job is "research this and write it up", that IS one brief: an agent
  with tools does the whole thing in its own turn, and splitting it into
  find/read/summarize just spends three model calls to reach the same place
  while losing everything the agent knew between them. Use one step when the
  work is one continuous piece of judgment with no human decision inside it.

  A few steps. Reach for a second and third step only when something between
  them is REAL: a human decides (approval_gate), the run must survive a wait
  (wait_until), a specific module operation must be called with exact arguments
  (engenty_tool), or a later step needs an earlier one's output in a fixed
  shape it can be checked against (an output_schema). Those are the things a
  single agent turn genuinely cannot do.

  Branches and loops. Only when the run really diverges: work that must be
  skipped when a gate is declined, per-item work over a list, a retry until a
  condition holds. Branching that only reorders prose is noise.

Two failure modes, equally bad. A graph that is one long line of agent steps
handing prose to each other is worse than a single brief — each step re-reads
what the last one wrote and drift compounds. A graph that decomposes judgment
into mechanical steps ("get the name", "look up the address") is worse still:
it pays a model call for something an agent does for free inside one turn.

Design rules that make a good Workflow:
  · Put agents ONLY where judgment is needed. Everything mechanical should be a
    mapping, conditional, or tool — those cost nothing and behave the same every
    run.
  · Any irreversible effect (sending, paying, publishing, deleting) goes behind
    an approval_gate.
  · Rejection is not implicit: after a gate, branch on the decision if "no"
    should skip the work.
  · An approval gate may not sit inside a foreach.
  · A native { "type": "agent", "agentId": … } entry is accepted and rewritten
    to a run_specialist step on the way in, but write run_specialist yourself —
    it is the only form that carries a brief, an output_schema and allowed_tools.

WIZARD. A workflow published with surface "wizard" is walked by a person one
page at a time: every approval_gate is a page, and nothing else is shown
between pages except the running step's name. Rules that make a good one:
  · The first gate collects what only the person knows — kind "surface" with
    a Form of inputs (TextField, TextArea, Select, ObjectPicker…) and one
    Button whose event is "next". Leave the run's input_schema empty; the
    page is the input.
  · When the result is a module RECORD, draft the operation's INPUT and let
    the person edit it on the page: the run_specialist step returns exactly
    what the write takes, the gate's top-level "data" key makes that object
    the page's data model, the page's inputs bind into it ("value":
    {"path":"/offer/title"}; a list of rows is one row component repeated
    with "children": {"componentId":"<row id>","path":"/offer/blocks"}), and
    the gate's answer goes straight into the engenty_tool that writes it. No
    document in between — the module holds the record.
  · When the result is a DOCUMENT, put it in an artifact (artifact_write,
    then show_artifact): it opens beside the pages and every later page can
    show it with Document { artifactRef }.
  · When the person may ask for changes, the loop is: draft (run_specialist)
    → review (a surface gate showing the draft, with a notes TextArea and
    Buttons) as ONE inline workflow entry inside a "dountil" loop whose
    predicate reads that entry's "event".
  · The last gate confirms the irreversible effect (send, create, book).
  · A wizard's pages are its UI, so end a record-producing run with a
    show_objects node on what it wrote: the conversation then holds the
    record's card instead of nothing (a specialist step's structured answer is
    the graph's data, not a message — it lives in the run's own thread).
  · End with a mapping that sets "summary": one sentence, then the record as
    a markdown link on its own line — "[<number> — <title>](<the write's
    link>)". The last page reads that link back and opens the record in the
    pane beside it, and the link's text names the pane's tab, so label it
    with the record, never "open it".
  · A wizard with no gate is invalid.
  · State across pages: the engine resolves only TOP-LEVEL mapping keys, and
    a loop body receives its OWN previous output on every iteration. So
    flatten what later pages need into one object with a mapping before the
    loop, end the loop body with a mapping that re-emits that object (plus
    what the iteration produced), and feed a page from it through the gate's
    top-level "data" key.

Your reply must be STRICTLY VALID JSON — count your braces. A single surplus
or missing "}" discards the entire graph; nothing recovers a reply that does
not parse. Before finishing, re-check that every "{" and "[" you opened is
closed exactly once, especially around deeply nested output_schema values.
`.trim();

/**
 * The part of `GRAPH_GUIDANCE` that a tool DESCRIPTION can afford to carry.
 *
 * The full text is ~7.5 KB. On `workflow_propose`'s `graph` parameter that rode
 * in the prompt on every model call of every run — the single largest
 * description in the tool surface — to teach a tool the model calls rarely.
 * Authoring rules are reference material, and reference material is fetched.
 *
 * So the description keeps the shape rules that are fatal and unguessable, and
 * `workflow_propose` returns the full text with any validation failure: a graph
 * that lands first try never pays for it, and one that misses gets more help
 * than the description ever gave. `draft-from-description` is a dedicated
 * authoring call and still uses the full text up front.
 */
export const GRAPH_GUIDANCE_ESSENTIALS = `
An ordered list of entries. A user-visible step is normally TWO entries: a
"mapping" carrying constant arguments, then the entry that consumes them —
arguments reach a step ONLY from the mapping immediately before it.

  { "type": "mapping", "id": "prep-send",
    "mapConfig": "{\\"tool_id\\":{\\"value\\":\\"invoices_send\\"}}" },
  { "type": "tool", "id": "send", "toolId": "engenty_tool" }

"mapConfig" is a JSON *string*, not an object — the most common failure. Each
key inside takes exactly one source: {"value"}, {"initData":true,"path"},
{"step":"earlier-id","path"}, {"requestContextPath":"space.key"} or
{"template":"Hi \${initData.name}"}.

"toolId" is one of: run_specialist, engenty_tool, approval_gate,
pick_surface, apply_field_updates, wait_until, artifact_write, artifact_read, show_artifact,
show_ui, show_objects. A run_specialist "brief" must state that
step's own instruction — to hand it an earlier step's output, use a
{"template"} combining instruction text with \${stepResults.<id>.<field>},
never a bare {"step"} reference. Other entry types (no toolId): mapping,
conditional, parallel, foreach, loop, workflow, sleep, sleepUntil. Containers
do not nest and may not hold a mapping — the mapping feeding a branch goes at
the top level, before the container; a body of several steps is an inline
{ "type": "workflow", "id", "graph": [ … ] } entry. An approval_gate of kind
"surface" is a whole page ({ components, data } from the catalog) and resumes
with { approved, data, event } — a wizard is a graph with one such gate per
page. Put anything irreversible behind an
approval_gate, and use wait_until — never sleep — for waits beyond a few
minutes.

Prefer the SIMPLEST shape that does the job: one agent step is the right answer
more often than it looks. Add a step only for something an agent turn cannot do
— a human decision, a durable wait, an exact module call, or an output_schema a
later step is checked against.

Reply with strictly valid JSON. If this call fails validation, the response
carries the complete authoring rules; read them and call again.`.trim();
