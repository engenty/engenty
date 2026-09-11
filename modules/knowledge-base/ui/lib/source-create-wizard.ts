/**
 * Pure step model for the "add source" wizard.
 *
 * The step list is derived, not hard-coded: an adapter that indexes many
 * entries earns a selection step, one that resolves to a single document does
 * not. Keeping this outside the page component means the sequence — the part
 * that is easy to get subtly wrong — is testable without a router.
 */

import type { KbSourceAdapterDescriptor } from "../api.js";

export type KbSourceWizardStepId =
  | "type"
  | "configure"
  | "select"
  | "fetch"
  | "plan";

/**
 * How many entries the wizard fetches before the plan step. The point of the
 * test run is to have *something* real to analyze and to prove the settings
 * work — not to complete the crawl, which happens after the wizard finishes.
 */
export const KB_SOURCE_WIZARD_SAMPLE_SIZE = 5;

/** Adapters whose index is a list the user should narrow before fetching. */
export function kbSourceWizardNeedsSelectStep(
  adapter: KbSourceAdapterDescriptor | undefined
): boolean {
  return adapter?.index_mode === "review";
}

export function kbSourceWizardSteps(
  adapter: KbSourceAdapterDescriptor | undefined
): KbSourceWizardStepId[] {
  return [
    "type",
    "configure",
    ...(kbSourceWizardNeedsSelectStep(adapter)
      ? (["select"] as const)
      : ([] as const)),
    "fetch",
    "plan",
  ];
}

/**
 * The subset fetched during the wizard. An empty result means "no restriction"
 * — single-document adapters have nothing to narrow, and passing an empty
 * `selected_item_keys` to a run would read as "fetch nothing".
 */
export function kbSourceWizardSampleKeys(
  selectedKeys: readonly string[],
  sampleSize = KB_SOURCE_WIZARD_SAMPLE_SIZE
): string[] {
  if (selectedKeys.length === 0 || sampleSize <= 0) {
    return [];
  }
  return [...selectedKeys].slice(0, sampleSize);
}

/** Entries the wizard deliberately left for the full sync it starts on finish. */
export function kbSourceWizardRemainingCount(
  selectedKeys: readonly string[],
  sampleSize = KB_SOURCE_WIZARD_SAMPLE_SIZE
): number {
  return Math.max(0, selectedKeys.length - sampleSize);
}

/**
 * Step index for the progress rail. Unknown ids answer 0 rather than -1 so a
 * stale step id from a back/forward navigation cannot render a broken rail.
 */
export function kbSourceWizardStepIndex(
  steps: readonly KbSourceWizardStepId[],
  step: KbSourceWizardStepId
): number {
  const index = steps.indexOf(step);
  return index < 0 ? 0 : index;
}

export function kbSourceWizardNextStep(
  steps: readonly KbSourceWizardStepId[],
  step: KbSourceWizardStepId
): KbSourceWizardStepId {
  const index = kbSourceWizardStepIndex(steps, step);
  return steps[Math.min(index + 1, steps.length - 1)] ?? step;
}

export function kbSourceWizardPreviousStep(
  steps: readonly KbSourceWizardStepId[],
  step: KbSourceWizardStepId
): KbSourceWizardStepId {
  const index = kbSourceWizardStepIndex(steps, step);
  return steps[Math.max(index - 1, 0)] ?? step;
}

export type KbSourceWizardGroupId = "web" | "files" | "manual" | "other";

/**
 * Which group each built-in adapter belongs to on the type step. Adapters the
 * registry grows later still show up — under `other` — instead of vanishing
 * from the picker because nobody updated this table.
 */
const ADAPTER_GROUPS: Record<string, KbSourceWizardGroupId> = {
  file_upload: "files",
  firecrawl_url: "web",
  manual: "manual",
  sitemap: "web",
  url: "web",
  web_index: "web",
};

export const KB_SOURCE_WIZARD_GROUP_ORDER: KbSourceWizardGroupId[] = [
  "web",
  "files",
  "manual",
  "other",
];

export function kbSourceWizardGroupOf(
  adapterId: string
): KbSourceWizardGroupId {
  return ADAPTER_GROUPS[adapterId] ?? "other";
}

export function groupKbSourceWizardAdapters(
  adapters: readonly KbSourceAdapterDescriptor[]
): Array<{
  adapters: KbSourceAdapterDescriptor[];
  group: KbSourceWizardGroupId;
}> {
  return KB_SOURCE_WIZARD_GROUP_ORDER.flatMap((group) => {
    const rows = adapters.filter(
      (adapter) => kbSourceWizardGroupOf(adapter.id) === group
    );
    return rows.length > 0 ? [{ adapters: rows, group }] : [];
  });
}

export interface KbSourceWizardContentOptions {
  attachOriginal: boolean;
  includeFullContent: boolean;
  includeQuestions: boolean;
  includeSummary: boolean;
  splitLongArticles: boolean;
}

export interface KbSourceWizardPlan {
  /** Arm the chosen mode so it re-runs after every future sync. */
  active: boolean;
  /** An agent authors a wiki, rather than the source text being filed as-is. */
  agentic: boolean;
  categoryId: string;
  content: KbSourceWizardContentOptions;
  instructions: string;
  scope: "per_entry" | "per_source";
  templateId: string;
  /** `inherit` takes the category's template; `none` opts out entirely. */
  templateMode: "inherit" | "none" | "template";
}

export function defaultKbSourceWizardPlan(): KbSourceWizardPlan {
  return {
    active: true,
    agentic: false,
    categoryId: "",
    content: {
      attachOriginal: false,
      includeFullContent: true,
      includeQuestions: false,
      includeSummary: false,
      splitLongArticles: false,
    },
    instructions: "",
    scope: "per_entry",
    templateId: "",
    templateMode: "inherit",
  };
}

export function kbSourceWizardStrategy(
  plan: KbSourceWizardPlan
): "agentic" | "per_entry" | "per_source" {
  return plan.agentic ? "agentic" : plan.scope;
}

/**
 * The plan as it is persisted on the source.
 *
 * Both activation flags are always written, never just the chosen one: the
 * wizard is the moment the source's mode is decided, and leaving the other
 * flag undefined would let a stale `true` survive as a second armed mode
 * nobody asked for.
 */
export function kbSourceWizardIngestConfig(
  plan: KbSourceWizardPlan
): Record<string, unknown> {
  const agentic = plan.agentic;
  return {
    agentic_active: agentic && plan.active,
    agentic_instructions: agentic ? plan.instructions.trim() : "",
    attach_original: plan.content.attachOriginal,
    authored_active: !agentic && plan.active,
    category_id: plan.categoryId || null,
    include_full_content: plan.content.includeFullContent,
    include_questions: plan.content.includeQuestions,
    include_summary: plan.content.includeSummary,
    split_long_articles: plan.content.splitLongArticles,
    // Only the explicit binding carries an id; `inherit` and `none` are modes,
    // and leaving a stale id beside them is how a source ends up bound to a
    // template the user thought they had switched off.
    template_id:
      plan.templateMode === "template" && plan.templateId
        ? plan.templateId
        : null,
    template_mode: plan.templateMode,
  };
}

/**
 * Read the new source's id out of a create response.
 *
 * `createKbSource` is typed `{ data: KbSource }`, but the API client unwraps
 * success envelopes, so what actually arrives is usually the source itself.
 * Both shapes are accepted rather than trusting either — reading the wrong one
 * fails as `undefined` far from the cause.
 */
export function kbCreatedSourceId(created: unknown): string {
  if (typeof created !== "object" || created === null) {
    throw new Error("kb_source_create_no_id");
  }
  const row = created as { data?: { id?: unknown }; id?: unknown };
  const id = typeof row.id === "string" ? row.id : row.data?.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("kb_source_create_no_id");
  }
  return id;
}
