// Jev composes a surface from prepared candidates.
//
// A candidate is a configured piece of UI — its A2UI components, props and
// data bindings already set — plus one line saying what it shows. Jev never
// writes a component or a label: one System One call answers, all at once,
// a yes/no per candidate and a choice per group of candidates that exclude
// each other. The kept candidates are assembled in the order they are listed,
// under one root Column. Content lives in the candidates and the data model,
// so the source format of what is shown never reaches the model.
//
// `assembleSurface` is the same assembly without the model, for a surface
// that is rebuilt from a stored selection (the live inbox dashboard).
import type {
  Answer,
  ClassifierClient,
  JsonValue,
  Question,
} from "@engenty/typesafe-client";
import { validateEngentyA2uiComponents } from "./spec.js";

type Component = Record<string, unknown>;

export interface SurfaceCandidate {
  /**
   * The candidate's A2UI components. The first one is its top component and
   * carries the candidate's id; the others are its own children.
   */
  components: Component[];
  /** What this piece shows, for Jev. */
  description: string;
  /**
   * Kept when the model is unavailable or its answer is unusable. Required
   * candidates are always kept and need not set it.
   */
  fallback?: boolean;
  /** Candidates sharing a group exclude each other; Jev picks one. */
  group?: string;
  id: string;
  /**
   * A container candidate this one is placed in (a Grid of charts). The
   * container is kept exactly when one of its children is, and lists them
   * in candidate order.
   */
  parent?: string;
  /** Always kept — an Open button, a title. */
  required?: boolean;
}

export interface SurfaceGroup {
  id: string;
  /** What the choice decides, for Jev. */
  instructions: string;
  /** True when "none of them" is a valid answer. */
  optional?: boolean;
}

export interface ComposeSurfaceInput {
  candidates: SurfaceCandidate[];
  /** Short structured context for Jev: what the surface is about. */
  context?: JsonValue;
  data?: Record<string, unknown>;
  groups?: SurfaceGroup[];
  /** P(yes) at or above which a candidate is kept. Default 0.5. */
  includeFloor?: number;
  /** Null when no classifier is bound: the fallback selection is used. */
  jev: ClassifierClient | null;
  /** What the person asked for, or what the surface is for. */
  prompt: string;
  /**
   * The caller's own questions, answered in the same call (which mail rows
   * matter). Their answers come back untouched.
   */
  questions?: Record<string, Question>;
}

export interface ComposedSurface {
  /** The caller's own questions' answers; empty without a model answer. */
  answers: Record<string, Answer>;
  components: Component[];
  data: Record<string, unknown>;
  /** The kept candidate ids — store these to rebuild the same surface. */
  kept: string[];
  /** Whether Jev decided, or the fallback selection stood in. */
  source: "jev" | "fallback";
}

const DEFAULT_FLOOR = 0.5;
const NONE = "none";

function includeKey(id: string): string {
  return `include_${id}`;
}

function groupKey(id: string): string {
  return `group_${id}`;
}

function isContainer(
  candidate: SurfaceCandidate,
  candidates: readonly SurfaceCandidate[]
): boolean {
  return candidates.some((other) => other.parent === candidate.id);
}

/** The candidates Jev decides on: not required, not a container. */
function decidable(candidates: readonly SurfaceCandidate[]) {
  return candidates.filter(
    (candidate) => !(candidate.required || isContainer(candidate, candidates))
  );
}

function surfaceQuestions(
  input: ComposeSurfaceInput
): Record<string, Question> {
  const questions: Record<string, Question> = {};
  const open = decidable(input.candidates);
  for (const candidate of open) {
    if (!candidate.group) {
      questions[includeKey(candidate.id)] = {
        instructions: `Show this: ${candidate.description}`,
        type: "noul",
      };
    }
  }
  for (const group of input.groups ?? []) {
    const members = open.filter((candidate) => candidate.group === group.id);
    if (members.length === 0) {
      continue;
    }
    questions[groupKey(group.id)] = {
      criteria: {
        ...Object.fromEntries(
          members.map((member) => [member.id, member.description])
        ),
        ...(group.optional ? { [NONE]: "None of these." } : {}),
      },
      instructions: group.instructions,
      type: "choice",
    };
  }
  return questions;
}

function keptFromAnswers(
  input: ComposeSurfaceInput,
  answers: Record<string, Answer>
): Set<string> {
  const floor = input.includeFloor ?? DEFAULT_FLOOR;
  const kept = new Set<string>();
  const open = decidable(input.candidates);
  for (const candidate of open) {
    if (candidate.group) {
      continue;
    }
    const answer = answers[includeKey(candidate.id)];
    if (answer?.type !== "noul") {
      throw new Error(`surface_answer_missing: ${candidate.id}`);
    }
    if (answer.noul >= floor) {
      kept.add(candidate.id);
    }
  }
  for (const group of input.groups ?? []) {
    const members = open.filter((candidate) => candidate.group === group.id);
    if (members.length === 0) {
      continue;
    }
    const answer = answers[groupKey(group.id)];
    const offered = new Set([
      ...members.map((member) => member.id),
      ...(group.optional ? [NONE] : []),
    ]);
    if (answer?.type !== "choice" || !offered.has(answer.choice)) {
      throw new Error(`surface_answer_invalid: ${group.id}`);
    }
    if (answer.choice !== NONE) {
      kept.add(answer.choice);
    }
  }
  return kept;
}

function fallbackKept(candidates: readonly SurfaceCandidate[]): Set<string> {
  return new Set(
    decidable(candidates)
      .filter((candidate) => candidate.fallback)
      .map((candidate) => candidate.id)
  );
}

/**
 * The surface for a selection: required candidates, the chosen ones, and
 * each container that holds at least one of them — in candidate order.
 */
export function assembleSurface(params: {
  candidates: readonly SurfaceCandidate[];
  data?: Record<string, unknown>;
  kept: Iterable<string>;
}): { components: Component[]; data: Record<string, unknown>; kept: string[] } {
  const { candidates } = params;
  const chosen = new Set(params.kept);
  const keep = (candidate: SurfaceCandidate): boolean =>
    candidate.required === true ||
    (isContainer(candidate, candidates)
      ? candidates.some((child) => child.parent === candidate.id && keep(child))
      : chosen.has(candidate.id));
  const kept = candidates.filter(keep);
  const keptIds = new Set(kept.map((candidate) => candidate.id));
  const components: Component[] = [
    {
      children: kept
        .filter(
          (candidate) => !(candidate.parent && keptIds.has(candidate.parent))
        )
        .map((candidate) => candidate.id),
      component: "Column",
      gap: "md",
      id: "root",
    },
  ];
  for (const candidate of kept) {
    const [top, ...rest] = candidate.components;
    if (!top) {
      continue;
    }
    components.push(
      isContainer(candidate, candidates)
        ? {
            ...top,
            children: kept
              .filter((child) => child.parent === candidate.id)
              .map((child) => child.id),
          }
        : top,
      ...rest
    );
  }
  return {
    components,
    data: params.data ?? {},
    kept: kept.map((candidate) => candidate.id),
  };
}

function checked(
  surface: ReturnType<typeof assembleSurface>
): ReturnType<typeof assembleSurface> {
  const issues = validateEngentyA2uiComponents(surface.components);
  if (issues.length > 0) {
    throw new Error(
      `surface_invalid: ${issues.map((issue) => issue.message).join("; ")}`
    );
  }
  return surface;
}

/**
 * One Jev call decides which candidates the surface shows; the assembly is
 * validated before it is returned. A missing model, a failed call or an
 * unusable answer falls back to the candidates marked `fallback` — the
 * surface is never empty because the model was.
 */
export async function composeSurface(
  input: ComposeSurfaceInput
): Promise<ComposedSurface> {
  const questions = surfaceQuestions(input);
  const asked = { ...questions, ...input.questions };
  if (input.jev && Object.keys(asked).length > 0) {
    try {
      const response = await input.jev.systemOne({
        questions: asked,
        state: {
          prompt: input.prompt,
          ...(input.context === undefined ? {} : { context: input.context }),
        },
      });
      const kept = keptFromAnswers(input, response.answers);
      const own = Object.fromEntries(
        Object.keys(input.questions ?? {}).flatMap((key) => {
          const answer = response.answers[key];
          return answer ? [[key, answer]] : [];
        })
      );
      return {
        ...checked(
          assembleSurface({
            candidates: input.candidates,
            data: input.data,
            kept,
          })
        ),
        answers: own,
        source: "jev",
      };
    } catch {
      // The fallback selection below stands in for an unusable answer.
    }
  }
  return {
    ...checked(
      assembleSurface({
        candidates: input.candidates,
        data: input.data,
        kept: fallbackKept(input.candidates),
      })
    ),
    answers: {},
    source: "fallback",
  };
}
