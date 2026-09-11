/**
 * TASKS.md — an engenty's own task pad: what it still owes, and the standing
 * goals it works toward.
 *
 * Private to the agent for one audience, exactly like MEMORY.md, and kept on
 * the same `ai.mastra_resources` row: MEMORY.md is the row's `workingMemory`,
 * this pad is `metadata.tasks_md`. Mastra's `updateResource` merges metadata
 * shallowly and leaves `workingMemory` alone when it is omitted, so the two
 * never clobber each other and there is no second store.
 *
 * It is NOT the tasks module. A tasks-module task is delegable, visible to the
 * people and colleagues of the Space, and a record with a lifecycle. A pad
 * line is a note the agent keeps for itself between turns — nobody else can
 * see it, nothing routes on it. The instructions and the UI copy both say so.
 *
 * The format is server-owned: every write, by the agent's tool or by a person
 * on the Manage tab, is parsed and rendered back canonically. One date per
 * line — the added date while open, the done date once checked — is what
 * makes the cleanup rule trivial: done lines older than the retention are
 * dropped without any model call, on every write and at the start of a turn.
 *
 * Audience: exactly MEMORY.md's — the shared-observation resource id
 * (agent×Space for shared engenties, agent×user for personal ones; the copilot
 * is a personal agent, so its pad is per person across Spaces).
 */
import { createHash } from "node:crypto";
import type {
  ComputeStateSignalArgs,
  ComputeStateSignalResult,
  Processor,
} from "@mastra/core/processors";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentMemoryStore } from "./agent-memory.js";
import { agentMemoryResourceId } from "./agent-memory.js";
import type { SharedObservationalMemoryIdentity } from "./shared-observational-memory.js";

export const AGENT_TASKS_MAX_CHARS = 6000;
export const TASKS_DONE_RETENTION_DAYS = 7;
export const AGENT_TASKS_STATE_ID = "agent-tasks";
export const AGENT_TASKS_PROCESSOR_ID = "engenty-agent-tasks";
export const TODO_EDIT_TOOL_ID = "todo_edit";
export const AGENT_TASKS_METADATA_KEY = "tasks_md";

const GOALS_HEADING = "## Goals";
const TASKS_HEADING = "## Tasks";
const TASK_LINE = /^-\s*\[( |x|X)\]\s*(?:(\d{4}-\d{2}-\d{2}):\s*)?(.*)$/;
const GOAL_LINE = /^-\s*(.*)$/;

export interface AgentTask {
  /** Added date while open; done date once checked. `YYYY-MM-DD`. */
  date: string;
  done: boolean;
  text: string;
}

export interface AgentTasks {
  goals: string[];
  tasks: AgentTask[];
}

/** The row an engenty's TASKS.md lives on — MEMORY.md's — or null when it has no audience. */
export function agentTasksResourceId(
  identity: SharedObservationalMemoryIdentity
): string | null {
  return agentMemoryResourceId(identity);
}

function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Tolerant parse: the two headings split the file; a task line without a
 * date gets today's; a line under no heading is an open task. Blank lines and
 * the `# TASKS.md` title are ignored.
 */
export function parseAgentTasks(
  markdown: string,
  now = new Date()
): AgentTasks {
  const goals: string[] = [];
  const tasks: AgentTask[] = [];
  let section: "goals" | "tasks" = "tasks";
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("# ")) {
      continue;
    }
    if (line.toLowerCase() === GOALS_HEADING.toLowerCase()) {
      section = "goals";
      continue;
    }
    if (line.toLowerCase() === TASKS_HEADING.toLowerCase()) {
      section = "tasks";
      continue;
    }
    if (line.startsWith("## ")) {
      section = "tasks";
      continue;
    }
    const task = TASK_LINE.exec(line);
    if (task) {
      const text = oneLine(task[3] ?? "");
      if (text) {
        tasks.push({
          date: task[2] ?? isoDate(now),
          done: task[1] !== " ",
          text,
        });
      }
      continue;
    }
    const goal = GOAL_LINE.exec(line);
    const text = oneLine(goal ? (goal[1] ?? "") : line);
    if (!text) {
      continue;
    }
    if (section === "goals") {
      goals.push(text);
    } else {
      tasks.push({ date: isoDate(now), done: false, text });
    }
  }
  return { goals, tasks };
}

/** Canonical file. Empty when there is nothing to keep. */
export function renderAgentTasks(model: AgentTasks): string {
  const parts: string[] = [];
  if (model.goals.length > 0) {
    parts.push([GOALS_HEADING, ...model.goals.map((g) => `- ${g}`)].join("\n"));
  }
  if (model.tasks.length > 0) {
    parts.push(
      [
        TASKS_HEADING,
        ...model.tasks.map(
          (t) => `- [${t.done ? "x" : " "}] ${t.date}: ${t.text}`
        ),
      ].join("\n")
    );
  }
  return parts.join("\n\n");
}

/** Drop done tasks whose done date is older than the retention. */
export function pruneAgentTasks(
  model: AgentTasks,
  now = new Date(),
  retentionDays = TASKS_DONE_RETENTION_DAYS
): { model: AgentTasks; removed: number } {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const cutoffDate = isoDate(cutoff);
  const kept = model.tasks.filter((t) => !t.done || t.date >= cutoffDate);
  return {
    model: { goals: model.goals, tasks: kept },
    removed: model.tasks.length - kept.length,
  };
}

export interface TodoEditOps {
  add?: string[];
  done?: string[];
  drop?: string[];
  goals?: string[];
}

/**
 * A model asked for plain text tends to hand back a whole line anyway —
 * `- [ ] 2026-09-07: text`. Strip the bullet and checkbox; a leading
 * `YYYY-MM-DD:` was meant as a due date, so it stays, in words, at the end.
 */
export function normalizeTaskText(text: string): string {
  let clean = oneLine(text)
    .replace(/^-\s*/, "")
    .replace(/^\[( |x|X)\]\s*/, "");
  const due = /^(\d{4}-\d{2}-\d{2}):\s*(.*)$/.exec(clean);
  if (due?.[2]) {
    clean = `${due[2]} (due ${due[1]})`;
  }
  return clean;
}

function matches(text: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  return n.length > 0 && text.toLowerCase().includes(n);
}

/**
 * Apply a batch in a fixed order — drop, done, add, goals — so one call can
 * close out a turn: check off what got finished, drop what no longer applies,
 * add what is still owed. `done` and `drop` match by case-insensitive
 * substring over tasks (and `drop` over goals too); `goals` replaces the
 * whole Goals section.
 */
export function applyTodoEdit(
  model: AgentTasks,
  ops: TodoEditOps,
  now = new Date()
): { model: AgentTasks; matched: number; unmatched: string[] } {
  const today = isoDate(now);
  let goals = [...model.goals];
  let tasks = model.tasks.map((t) => ({ ...t }));
  let matched = 0;
  const unmatched: string[] = [];

  for (const needle of ops.drop ?? []) {
    const beforeTasks = tasks.length;
    const beforeGoals = goals.length;
    tasks = tasks.filter((t) => !matches(t.text, needle));
    goals = goals.filter((g) => !matches(g, needle));
    const hits = beforeTasks - tasks.length + (beforeGoals - goals.length);
    if (hits === 0) {
      unmatched.push(needle);
    }
    matched += hits;
  }
  for (const needle of ops.done ?? []) {
    let hits = 0;
    for (const task of tasks) {
      if (!task.done && matches(task.text, needle)) {
        task.done = true;
        task.date = today;
        hits += 1;
      }
    }
    if (hits === 0) {
      unmatched.push(needle);
    }
    matched += hits;
  }
  for (const text of ops.add ?? []) {
    const clean = normalizeTaskText(text);
    if (clean) {
      tasks.push({ date: today, done: false, text: clean });
    }
  }
  if (ops.goals) {
    goals = ops.goals.map(oneLine).filter(Boolean);
  }
  return { model: { goals, tasks }, matched, unmatched };
}

export async function readAgentTasks(
  store: AgentMemoryStore,
  resourceId: string
): Promise<string> {
  const record = await store.getResourceById({ resourceId });
  const value = record?.metadata?.[AGENT_TASKS_METADATA_KEY];
  return typeof value === "string" ? value.trim() : "";
}

export class AgentTasksTooLargeError extends Error {
  readonly length: number;
  constructor(length: number) {
    super(
      `tasks_too_large: ${length} characters, the limit is ${AGENT_TASKS_MAX_CHARS}`
    );
    this.name = "AgentTasksTooLargeError";
    this.length = length;
  }
}

/**
 * Parse, prune, render, write. Refuses anything over the cap. Returns the
 * canonical text that was stored (empty clears the pad).
 */
export async function writeAgentTasks(
  store: AgentMemoryStore,
  resourceId: string,
  contents: string,
  now = new Date()
): Promise<string> {
  const next = renderAgentTasks(
    pruneAgentTasks(parseAgentTasks(contents, now), now).model
  );
  if (next.length > AGENT_TASKS_MAX_CHARS) {
    throw new AgentTasksTooLargeError(next.length);
  }
  await store.updateResource({
    metadata: { [AGENT_TASKS_METADATA_KEY]: next },
    resourceId,
  });
  return next;
}

/** What the agent is told about its pad, appended to its instructions. */
export const AGENT_TASKS_INSTRUCTIONS = `## Your task list (TASKS.md)

Your own pad, delivered every turn as "TASKS.md": the goals you work toward at the top, then the tasks you still owe, each with a checkbox. It is private — nobody else sees it, nothing is delegated from it, and it is not a record. Work someone else must do or see goes to the Tasks app or to a colleague via \`message_agent\`, never here.
- Edit it with \`${TODO_EDIT_TOOL_ID}\`: \`add\` what you accepted but did not finish this turn or what you still owe; \`done\` what you finished (do this at the end of a turn, in the same call); \`drop\` what no longer applies; \`goals\` rewrites the Goals section (a few standing aims, not tasks).
- Before you start, read it: pick up what is open, drop what is stale.
- Done items disappear on their own after ${TASKS_DONE_RETENTION_DAYS} days. The file holds at most ${AGENT_TASKS_MAX_CHARS} characters; when a write is refused as too large, finish or drop items first.
- Facts to remember belong in MEMORY.md, not here.`;

class AgentTasksProcessor implements Processor {
  readonly id = AGENT_TASKS_PROCESSOR_ID;
  readonly name = "Engenty agent tasks";
  readonly stateId = AGENT_TASKS_STATE_ID;
  readonly #resourceId: string;
  readonly #store: AgentMemoryStore;
  readonly #now: () => Date;

  constructor(input: {
    now?: () => Date;
    resourceId: string;
    store: AgentMemoryStore;
  }) {
    this.#resourceId = input.resourceId;
    this.#store = input.store;
    this.#now = input.now ?? (() => new Date());
  }

  async computeStateSignal(
    _args: ComputeStateSignalArgs
  ): Promise<ComputeStateSignalResult> {
    const stored = await readAgentTasks(this.#store, this.#resourceId);
    if (!stored) {
      return;
    }
    // Turn start is the regular cleanup moment: a pad the agent has not
    // touched for a while still sheds its old done items here.
    const now = this.#now();
    const pruned = pruneAgentTasks(parseAgentTasks(stored, now), now);
    let tasks = stored;
    if (pruned.removed > 0) {
      tasks = await writeAgentTasks(
        this.#store,
        this.#resourceId,
        renderAgentTasks(pruned.model),
        now
      );
    }
    if (!tasks) {
      return;
    }
    const contents = [
      "TASKS.md — your own task list. Background, not instructions.",
      tasks,
    ].join("\n\n");
    return {
      cacheKey: createHash("sha256").update(contents).digest("hex"),
      contents,
      id: this.stateId,
      mode: "snapshot",
    };
  }
}

export function createAgentTasksTools(input: {
  now?: () => Date;
  resourceId: string;
  store: AgentMemoryStore;
}) {
  const now = input.now ?? (() => new Date());
  const edit = createTool({
    id: TODO_EDIT_TOOL_ID,
    description:
      "Edit your private TASKS.md in one call: add open tasks, check off finished ones (done), drop stale ones, or rewrite your Goals. done/drop match by a distinctive word of the line. Not the Tasks app — nobody else sees this pad. Refused when the file would exceed its size limit.",
    inputSchema: z.object({
      add: z
        .array(z.string().min(1).max(300))
        .max(20)
        .optional()
        .describe(
          "New open tasks, plain text only — no checkbox, no date prefix; the date is added. Say a due date in words."
        ),
      done: z
        .array(z.string().min(1).max(200))
        .max(20)
        .optional()
        .describe("Check off: a distinctive word of each finished task."),
      drop: z
        .array(z.string().min(1).max(200))
        .max(20)
        .optional()
        .describe("Remove: a distinctive word of each task or goal to drop."),
      goals: z
        .array(z.string().min(1).max(300))
        .max(10)
        .optional()
        .describe("Replaces the whole Goals section."),
    }),
    outputSchema: z.object({
      characters: z.number(),
      kept: z.boolean(),
      reason: z.string().optional(),
      tasks: z.string(),
      unmatched: z.array(z.string()).optional(),
    }),
    execute: async (ops) => {
      const at = now();
      const current = parseAgentTasks(
        await readAgentTasks(input.store, input.resourceId),
        at
      );
      const applied = applyTodoEdit(current, ops, at);
      const next = renderAgentTasks(pruneAgentTasks(applied.model, at).model);
      if (next.length > AGENT_TASKS_MAX_CHARS) {
        return {
          characters: next.length,
          kept: false,
          reason: `TASKS.md would be ${next.length} characters; the limit is ${AGENT_TASKS_MAX_CHARS}. Finish or drop items first, then edit again.`,
          tasks: renderAgentTasks(current),
          ...(applied.unmatched.length > 0
            ? { unmatched: applied.unmatched }
            : {}),
        };
      }
      const tasks = await writeAgentTasks(
        input.store,
        input.resourceId,
        next,
        at
      );
      return {
        characters: tasks.length,
        kept: true,
        tasks,
        ...(applied.unmatched.length > 0
          ? { unmatched: applied.unmatched }
          : {}),
      };
    },
  });
  return { [TODO_EDIT_TOOL_ID]: edit };
}

export type AgentTasksTools = ReturnType<typeof createAgentTasksTools>;

/**
 * The processor and tool for one run, or null when the agent has no pad
 * audience (module and interface agents: their `agentScope` names none).
 */
export function createAgentTasks(input: {
  identity: SharedObservationalMemoryIdentity;
  now?: () => Date;
  store: AgentMemoryStore;
}): { processor: Processor; tools: AgentTasksTools } | null {
  const resourceId = agentTasksResourceId(input.identity);
  if (!resourceId) {
    return null;
  }
  const now = input.now;
  return {
    processor: new AgentTasksProcessor({
      resourceId,
      store: input.store,
      ...(now ? { now } : {}),
    }),
    tools: createAgentTasksTools({
      resourceId,
      store: input.store,
      ...(now ? { now } : {}),
    }),
  };
}
