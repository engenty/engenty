// Shared form state for custom routines — used by the create dialog, the
// agent desk's detail panel and the triggers dialog, so payload shaping and
// validation live in one place.
//
// A routine is the standing arrangement: the owning specialist, the published
// Action it runs, its outcome promise and report floor. Its wake sources are
// TRIGGER rows (1..n). The combined form here edits the routine plus its
// PRIMARY trigger (the first self-waking one); the triggers dialog edits any
// single trigger through the trigger half alone.
import type {
  CustomRoutineInput,
  RoutineDto,
  RoutineReportMode,
  RoutineTriggerDto,
  RoutineTriggerInput,
} from "./routines-api.js";
import {
  cronToPreset,
  type PresetSchedule,
  presetToCron,
} from "./schedule-cron.js";

export type RoutineTriggerType =
  | "schedule"
  | "module-events"
  | "webhook"
  | "manual"
  | "agent";

/** One trigger's editable fields, in form shape. */
export interface TriggerFormValue {
  enabled: boolean;
  /** module-events only: JSON object text, shallow payload match. */
  eventFilter: string;
  /**
   * Event → Action input mapping: JSON object text in the graph mapping
   * grammar, with the event payload as `initData`. Blank means the payload
   * itself is the Action's input.
   */
  inputMapping: string;
  /** module-events only: canonical bus event name (`module.entity.verb`). */
  resource: string;
  schedule: PresetSchedule;
  /** manual only: a short key a person can invoke the routine by. */
  shortcode: string;
  triggerType: RoutineTriggerType;
}

/** What the routine runs: a prompt in prose, or a workflow from the canvas. */
export type RoutineBodyMode = "prompt" | "workflow";

export interface RoutineFormValue extends TriggerFormValue {
  /** The specialist that owns the routine. The Action is what runs; only a
   * specialist owns a routine. */
  agentId: string;
  description: string;
  /** Prompt mode is the default: one instruction, one trigger, no canvas. */
  mode: RoutineBodyMode;
  name: string;
  /** The prompt, in prompt mode. Submitted as `prompt`. */
  prompt: string;
  /** How loudly a finished run reports; the declared floor. */
  reportMode: RoutineReportMode;
  /** The bound workflow — the published Workflow this routine runs. Required.
   * Submitted as `workflow_id`. */
  workflowId: string;
}

export type RoutineFormErrorKey =
  | "nameRequired"
  | "agentRequired"
  | "actionRequired"
  | "promptRequired"
  | "resourceRequired"
  | "filterInvalid"
  | "mappingInvalid";

export function defaultTriggerFormValue(
  triggerType: RoutineTriggerType = "schedule"
): TriggerFormValue {
  return {
    enabled: true,
    eventFilter: "",
    inputMapping: "",
    resource: "",
    schedule: { type: "weekdays", hour: 9, minute: 0 },
    shortcode: "",
    triggerType,
  };
}

export function defaultRoutineFormValue(
  defaultAgentId?: string | null,
  defaultActionId?: string | null
): RoutineFormValue {
  return {
    ...defaultTriggerFormValue(),
    workflowId: defaultActionId ?? "",
    agentId: defaultAgentId ?? "",
    description: "",
    // A host that hands in a workflow wants that workflow; everyone else
    // starts from a prompt.
    mode: defaultActionId ? "workflow" : "prompt",
    name: "",
    prompt: "",
    // `quiet` is the right default for a recurring check: silence when there is
    // nothing to say, a card on the desk when there is.
    reportMode: "quiet",
  };
}

export function triggerTypeOf(trigger: RoutineTriggerDto): RoutineTriggerType {
  if (trigger.kind === "event") {
    return trigger.provider_id === "webhook" ? "webhook" : "module-events";
  }
  return trigger.kind;
}

export function triggerToFormValue(
  trigger: RoutineTriggerDto
): TriggerFormValue {
  return {
    enabled: trigger.enabled,
    eventFilter: trigger.event_filter
      ? JSON.stringify(trigger.event_filter, null, 2)
      : "",
    inputMapping: trigger.input_mapping
      ? JSON.stringify(trigger.input_mapping, null, 2)
      : "",
    resource: trigger.resource ?? "",
    // A timezone-carrying cron (agent-created) is written in THAT zone's
    // local time. The preset picker thinks in UTC crons — round-tripping it
    // through `cronToPreset`/`presetToCron` would shift the hours while the
    // trigger keeps its timezone (a double conversion). Fall back to the
    // custom preset: the raw cron passes through unchanged and the PATCH
    // never touches `timezone`.
    schedule: trigger.timezone
      ? { type: "custom", hour: 0, minute: 0, cron: trigger.cron ?? "" }
      : cronToPreset(trigger.cron ?? ""),
    shortcode: trigger.shortcode ?? "",
    triggerType: triggerTypeOf(trigger),
  };
}

/**
 * The routine's PRIMARY trigger for the combined form: the first self-waking
 * one (schedule/event), or the first row at all. Null only for a routine with
 * no triggers, which the server refuses to produce.
 */
export function primaryTrigger(routine: RoutineDto): RoutineTriggerDto | null {
  const triggers = routine.triggers ?? [];
  return (
    triggers.find(
      (trigger) => trigger.kind === "schedule" || trigger.kind === "event"
    ) ??
    triggers[0] ??
    null
  );
}

export function routineToFormValue(routine: RoutineDto): RoutineFormValue {
  const primary = primaryTrigger(routine);
  return {
    ...(primary ? triggerToFormValue(primary) : defaultTriggerFormValue()),
    workflowId: routine.workflow_id,
    agentId: routine.agent_id,
    description: routine.description ?? "",
    mode: routine.prompt ? "prompt" : "workflow",
    name: routine.name,
    prompt: routine.prompt ?? "",
    reportMode: routine.report,
  };
}

/** Shared by the payload filter and the input mapping — both are JSON objects. */
function parseJsonObject(
  text: string
): Record<string, unknown> | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : "invalid";
  } catch {
    return "invalid";
  }
}

/** First validation error of one trigger's form half, or null. */
export function validateTriggerForm(
  value: TriggerFormValue
): RoutineFormErrorKey | null {
  const isEvent =
    value.triggerType === "module-events" || value.triggerType === "webhook";
  // An event wakes the Action through its INPUT: the payload becomes
  // `initData`, mapped when the trigger says how and passed whole when it
  // doesn't. A malformed mapping is the one thing to refuse here.
  if (isEvent && parseJsonObject(value.inputMapping) === "invalid") {
    return "mappingInvalid";
  }
  if (value.triggerType === "module-events" && !value.resource.trim()) {
    return "resourceRequired";
  }
  if (isEvent && parseJsonObject(value.eventFilter) === "invalid") {
    return "filterInvalid";
  }
  return null;
}

// Returns the first validation error as a translation-key suffix, or null.
export function validateRoutineForm(
  value: RoutineFormValue
): RoutineFormErrorKey | null {
  if (!value.name.trim()) {
    return "nameRequired";
  }
  // The Action is what runs; only a specialist owns a routine.
  if (!value.agentId) {
    return "agentRequired";
  }
  if (value.mode === "prompt") {
    if (!value.prompt.trim()) {
      return "promptRequired";
    }
  } else if (!value.workflowId) {
    return "actionRequired";
  }
  return validateTriggerForm(value);
}

/** One trigger's wire body, from its form half. */
export function triggerFormToInput(
  value: TriggerFormValue
): RoutineTriggerInput {
  const base = { enabled: value.enabled };
  if (value.triggerType === "schedule") {
    return { ...base, cron: presetToCron(value.schedule), kind: "schedule" };
  }
  if (value.triggerType === "manual") {
    return {
      ...base,
      kind: "manual",
      shortcode: value.shortcode.trim() || null,
    };
  }
  if (value.triggerType === "agent") {
    return { ...base, kind: "agent" };
  }
  const filter = parseJsonObject(value.eventFilter);
  const mapping = parseJsonObject(value.inputMapping);
  return {
    ...base,
    event_filter: filter === "invalid" ? null : filter,
    input_mapping: mapping === "invalid" ? null : mapping,
    kind: "event",
    provider_id: value.triggerType === "webhook" ? "webhook" : "module-events",
    resource:
      value.triggerType === "module-events" ? value.resource.trim() : null,
  };
}

/** The routine-level half — what a PATCH sends. */
export function routineFormToRoutinePatch(
  value: RoutineFormValue
): Partial<CustomRoutineInput> {
  return {
    description: value.description.trim() || null,
    name: value.name.trim(),
    report: value.reportMode,
    ...routineBody(value),
  };
}

/** The body half of a payload: the prompt, or the workflow it binds. */
function routineBody(
  value: RoutineFormValue
): Partial<Pick<CustomRoutineInput, "prompt" | "workflow_id">> {
  return value.mode === "prompt"
    ? { prompt: value.prompt.trim() }
    : { workflow_id: value.workflowId };
}

/**
 * The full create body: routine + initial triggers. The chosen wake source is
 * joined by the standard manual + agent pair (unless it IS one of them), the
 * same defaults every wrapped workflow carries.
 */
export function routineFormToPayload(
  value: RoutineFormValue
): CustomRoutineInput {
  const primary = triggerFormToInput(value);
  const triggers: RoutineTriggerInput[] = [primary];
  for (const kind of ["manual", "agent"] as const) {
    if (primary.kind !== kind) {
      triggers.push({ kind });
    }
  }
  return {
    ...routineFormToRoutinePatch(value),
    agent_id: value.agentId,
    triggers,
  };
}
