import {
  DEFAULT_UI_GUIDE_ACTIONS,
  type UiGuideInputConfig,
  type UiGuideInputField,
  type UiGuidePresentation,
  type UiGuideResolvedResult,
  type UiGuideSession,
  type UiGuideShowConfig,
  type UiGuideShownResult,
  type UiGuideShowResult,
  type UiGuideUpdateConfig,
} from "./types.js";

type Listener = () => void;

interface InternalSession extends UiGuideSession {
  waitResolver: ((result: UiGuideResolvedResult) => void) | null;
}

let session: InternalSession | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function createGuideId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ui-guide-${Date.now()}`;
}

function normalizeActions(
  actions: UiGuideShowConfig["actions"]
): UiGuideSession["actions"] {
  if (!actions?.length) {
    return DEFAULT_UI_GUIDE_ACTIONS.map((action) => ({ ...action }));
  }
  return actions.map((action) => ({
    id: action.id.trim(),
    label: action.label.trim(),
    ...(action.variant ? { variant: action.variant } : {}),
  }));
}

function normalizeInput(
  input: UiGuideInputConfig | null | undefined
): UiGuideInputConfig | undefined {
  if (!input) {
    return;
  }
  return {
    ...(input.default_value === undefined
      ? {}
      : { default_value: input.default_value }),
    ...(input.label === undefined ? {} : { label: input.label }),
    ...(input.placeholder === undefined
      ? {}
      : { placeholder: input.placeholder }),
    ...(input.required === undefined ? {} : { required: input.required }),
    ...(input.submit_action_id === undefined
      ? {}
      : { submit_action_id: input.submit_action_id }),
    ...(input.type === undefined ? {} : { type: input.type }),
  };
}

function normalizeInputs(
  inputs: UiGuideInputField[] | null | undefined
): UiGuideInputField[] | undefined {
  if (!inputs?.length) {
    return;
  }
  return inputs.map((field) => ({
    id: field.id.trim(),
    ...(field.default_value === undefined
      ? {}
      : { default_value: field.default_value }),
    ...(field.label === undefined ? {} : { label: field.label }),
    ...(field.placeholder === undefined
      ? {}
      : { placeholder: field.placeholder }),
    ...(field.required === undefined ? {} : { required: field.required }),
    ...(field.type === undefined ? {} : { type: field.type }),
  }));
}

function normalizePresentation(
  presentation: UiGuidePresentation | undefined
): UiGuidePresentation {
  return presentation ?? "spotlight";
}

function dismissInternal(
  status: "dismissed" | "resolved"
): UiGuideResolvedResult | null {
  if (!session) {
    return null;
  }
  const current = session;
  const result: UiGuideResolvedResult = {
    guide_id: current.guide_id,
    ok: true,
    status,
  };
  const resolver = current.waitResolver;
  session = null;
  emit();
  resolver?.(result);
  return result;
}

export function getUiGuideSession(): UiGuideSession | null {
  return session;
}

export function subscribeUiGuide(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function showUiGuideSession(
  config: UiGuideShowConfig & { target_element?: HTMLElement | null }
): Promise<UiGuideShowResult> | UiGuideShowResult {
  const presentation = normalizePresentation(config.presentation);
  const target_element = config.target_element ?? null;
  if (presentation !== "modal" && !target_element) {
    throw new Error(`target is required for presentation="${presentation}".`);
  }

  // Replace any open guide; pending waiters resolve as dismissed.
  dismissInternal("dismissed");

  const guide_id = createGuideId();
  const wait = config.wait === true;
  const next: InternalSession = {
    actions: normalizeActions(config.actions),
    allow_target_interaction: config.allow_target_interaction !== false,
    body: config.body,
    guide_id,
    input: normalizeInput(config.input),
    inputs: normalizeInputs(config.inputs),
    placement: config.placement ?? "auto",
    presentation,
    show_dismiss: config.show_dismiss !== false,
    target_element,
    title: config.title,
    wait,
    waitResolver: null,
  };

  if (wait) {
    return new Promise<UiGuideShowResult>((resolve) => {
      next.waitResolver = resolve;
      session = next;
      emit();
    });
  }

  session = next;
  emit();
  const shown: UiGuideShownResult = {
    guide_id,
    ok: true,
    status: "shown",
  };
  return shown;
}

export function updateUiGuideSession(
  config: UiGuideUpdateConfig & { target_element?: HTMLElement | null }
): Promise<UiGuideShowResult> | UiGuideShowResult {
  if (!session) {
    throw new Error("No UI guide is open.");
  }

  if (config.title !== undefined) {
    session.title = config.title;
  }
  if (config.body !== undefined) {
    session.body = config.body ?? undefined;
  }
  if (config.actions !== undefined) {
    session.actions = normalizeActions(config.actions);
  }
  if (config.input !== undefined) {
    session.input = normalizeInput(config.input);
  }
  if (config.inputs !== undefined) {
    session.inputs = normalizeInputs(config.inputs);
  }
  if (config.placement !== undefined) {
    session.placement = config.placement;
  }
  if (config.presentation !== undefined) {
    session.presentation = config.presentation;
  }
  if (config.show_dismiss !== undefined) {
    session.show_dismiss = config.show_dismiss;
  }
  if (config.allow_target_interaction !== undefined) {
    session.allow_target_interaction = config.allow_target_interaction;
  }
  if (config.target_element !== undefined) {
    session.target_element = config.target_element;
  }

  if (session.presentation !== "modal" && !session.target_element) {
    throw new Error(
      `target is required for presentation="${session.presentation}".`
    );
  }

  const startWait = config.wait === true && !session.waitResolver;
  if (startWait) {
    session.wait = true;
    return new Promise<UiGuideShowResult>((resolve) => {
      if (!session) {
        resolve({
          guide_id: "",
          ok: true,
          status: "dismissed",
        });
        return;
      }
      session.waitResolver = resolve;
      emit();
    });
  }

  if (config.wait === false) {
    session.wait = false;
  }

  emit();

  if (session.waitResolver) {
    return {
      guide_id: session.guide_id,
      ok: true,
      status: "shown",
    };
  }

  return {
    guide_id: session.guide_id,
    ok: true,
    status: "shown",
  };
}

/**
 * Resolve a user action on the open guide.
 * Returns whether a wait Promise was settled and whether a follow-up message
 * should be injected (non-wait, non-dismiss actions).
 */
export function resolveUiGuideAction(args: {
  action_id: string;
  input_value?: string;
  input_values?: Record<string, string>;
  /** Esc / explicit dismiss — no follow-up when not waiting. */
  dismiss?: boolean;
}): {
  followUp: boolean;
  result: UiGuideResolvedResult;
  wasWaiting: boolean;
} | null {
  if (!session) {
    return null;
  }

  const current = session;
  const wasWaiting = Boolean(current.waitResolver);
  const result: UiGuideResolvedResult = {
    guide_id: current.guide_id,
    ok: true,
    status: args.dismiss ? "dismissed" : "resolved",
    ...(args.dismiss
      ? {}
      : {
          action_id: args.action_id,
          ...(args.input_value === undefined
            ? {}
            : { input_value: args.input_value }),
          ...(args.input_values === undefined
            ? {}
            : { input_values: args.input_values }),
        }),
  };

  const resolver = current.waitResolver;
  session = null;
  emit();
  resolver?.(result);

  const followUp = !(wasWaiting || args.dismiss);
  return { followUp, result, wasWaiting };
}

export function dismissUiGuideSession(): UiGuideResolvedResult {
  const result = dismissInternal("dismissed");
  if (!result) {
    return { guide_id: "", ok: true, status: "dismissed" };
  }
  return result;
}

/** Test helper — clears session without notifying waiters as success. */
export function resetUiGuideSessionForTests(): void {
  if (session?.waitResolver) {
    session.waitResolver({
      guide_id: session.guide_id,
      ok: true,
      status: "dismissed",
    });
  }
  session = null;
  emit();
}
