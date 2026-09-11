import { SPACE_TEMPLATES } from "@engenty/plugin-sdk";
import type { SpaceMountDeclaration } from "@engenty/ui-plugin-sdk";
import {
  type SpaceSelection,
  selectionFromDeclarations,
  toggleSelection,
} from "./space-setup-selection";

/**
 * `engenty` comes AFTER the space exists: review creates the space, then the
 * wizard ends on hiring its first engenty (pre-filled, skippable). Stepping
 * back from it is not possible — the space is already there.
 */
export const SPACE_CREATE_STEPS = [
  "basics",
  "modules",
  "capabilities",
  "review",
  "engenty",
] as const;

export type SpaceCreateStep = (typeof SPACE_CREATE_STEPS)[number];

const TEMPLATE_RECOMMENDATIONS: Record<string, readonly string[]> =
  Object.fromEntries(
    SPACE_TEMPLATES.map((template) => [template.id, template.featuredMountKeys])
  );

export function initialWizardSelection(
  baseline: readonly SpaceMountDeclaration[]
): SpaceSelection {
  return selectionFromDeclarations(baseline);
}

function moduleKeysFromRecommendations(
  recommendedKeys: ReadonlySet<string>
): Set<string> {
  return new Set(
    [...recommendedKeys].filter((key) => key.startsWith("module:"))
  );
}

/**
 * Preselect the template's featured modules. Switching templates replaces the
 * previous featured set and leaves anything the user added themselves.
 */
export function applyRecommendedModules(
  selection: SpaceSelection,
  recommendedKeys: ReadonlySet<string>,
  previouslyApplied: ReadonlySet<string>
): { applied: Set<string>; selection: SpaceSelection } {
  const nextRecommended = moduleKeysFromRecommendations(recommendedKeys);
  let next = selection;
  for (const key of previouslyApplied) {
    if (!nextRecommended.has(key)) {
      const resourceKey = key.slice("module:".length);
      next = toggleSelection(
        next,
        { resourceKey, resourceType: "module" },
        false
      );
    }
  }
  for (const key of nextRecommended) {
    if (next.has(key) || previouslyApplied.has(key)) {
      continue;
    }
    const resourceKey = key.slice("module:".length);
    next = toggleSelection(next, { resourceKey, resourceType: "module" }, true);
  }
  return { applied: nextRecommended, selection: next };
}

/** Steps the Continue button walks; `review` submits and `engenty` ends. */
export function nextWizardStep(step: SpaceCreateStep): SpaceCreateStep {
  if (step === "review" || step === "engenty") {
    return step;
  }
  const index = SPACE_CREATE_STEPS.indexOf(step);
  return SPACE_CREATE_STEPS[index + 1]!;
}

export function previousWizardStep(step: SpaceCreateStep): SpaceCreateStep {
  const index = SPACE_CREATE_STEPS.indexOf(step);
  return SPACE_CREATE_STEPS[Math.max(index - 1, 0)]!;
}

export function templateDefaultVisibility(
  templateId: string
): "open" | "private" {
  return templateId === "personal" ? "private" : "open";
}

export function templateRecommendationKeys(
  templateId: string,
  catalogKeys?: readonly string[]
): ReadonlySet<string> {
  return new Set(catalogKeys ?? TEMPLATE_RECOMMENDATIONS[templateId] ?? []);
}

export function selectedCount(
  selection: SpaceSelection,
  resourceType: "agent" | "connection" | "module" | "skill"
): number {
  return [...selection.values()].filter(
    (entry) => entry.resourceType === resourceType
  ).length;
}

export function optionalCount(
  selection: SpaceSelection,
  baseline: readonly SpaceMountDeclaration[],
  resourceType: "agent" | "connection" | "module" | "skill"
): number {
  const baselineKeys = new Set(
    baseline
      .filter((entry) => entry.resourceType === resourceType)
      .map((entry) => `${entry.resourceType}:${entry.resourceKey}`)
  );
  return [...selection.entries()].filter(
    ([key, entry]) =>
      entry.resourceType === resourceType && !baselineKeys.has(key)
  ).length;
}
