// Jev picks the next authored wizard page. It does not design a form —
// candidates are already in the workflow JSON (the CopilotKit picker pattern
// on top of `gateSurfaceFor`).
import { createClassifierClient, roleModelRef } from "@engenty/ai-core";
import { validateChoiceAnswer } from "@engenty/typesafe-client";
import {
  type GateKind,
  type GateSurface,
  gateSurfaceFor,
} from "./gate-surface.js";

const INCLUDE_FLOOR = 0.45;

/** Platform classifier when bound and keyed; otherwise null (fail open). */
function defaultJevClient() {
  try {
    return createClassifierClient(roleModelRef("classifier"))?.client ?? null;
  } catch {
    return null;
  }
}

export interface AuthoredGateField {
  description: string;
  id: string;
}

export interface AuthoredGateCandidate {
  data?: Record<string, unknown>;
  description: string;
  id: string;
  kind: GateKind;
  optional_fields?: AuthoredGateField[];
  payload: Record<string, unknown>;
  title?: string;
}

export interface PickedAuthoredGate {
  gate_id: string;
  kind: GateKind;
  payload: Record<string, unknown>;
  surface: GateSurface;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stripComponentIds(
  payload: Record<string, unknown>,
  drop: ReadonlySet<string>
): Record<string, unknown> {
  if (drop.size === 0) {
    return payload;
  }
  const components = Array.isArray(payload.components)
    ? payload.components.filter(
        (entry) =>
          !(
            isRecord(entry) &&
            typeof entry.id === "string" &&
            drop.has(entry.id)
          )
      )
    : payload.components;
  const cleaned = Array.isArray(components)
    ? components.map((entry) => {
        if (!(isRecord(entry) && Array.isArray(entry.children))) {
          return entry;
        }
        return {
          ...entry,
          children: entry.children.filter(
            (child) => typeof child !== "string" || !drop.has(child)
          ),
        };
      })
    : components;
  return { ...payload, components: cleaned };
}

function pickFirst(candidates: AuthoredGateCandidate[]): AuthoredGateCandidate {
  const first = candidates[0];
  if (!first) {
    throw new Error("pick_surface needs at least one authored gate candidate");
  }
  return first;
}

/**
 * One `systemOne` call: choose a prepared gate id, then optionally keep
 * authored fields. Series, labels and component types stay in the candidate.
 */
export async function pickAuthoredGate(
  params: {
    candidates: AuthoredGateCandidate[];
    prompt: string;
  },
  jev = defaultJevClient()
): Promise<PickedAuthoredGate> {
  const candidates = params.candidates;
  if (candidates.length === 0) {
    throw new Error("pick_surface needs at least one authored gate candidate");
  }
  let chosen = pickFirst(candidates);
  const dropped = new Set<string>();
  if (jev && candidates.length > 0) {
    const criteria = Object.fromEntries(
      candidates.map((candidate) => [candidate.id, candidate.description])
    );
    const fieldQuestions = Object.fromEntries(
      candidates.flatMap((candidate) =>
        (candidate.optional_fields ?? []).map((item) => [
          `include_${candidate.id}_${item.id}`,
          {
            instructions: item.description,
            type: "noul" as const,
          },
        ])
      )
    );
    const response = await jev.systemOne({
      questions: {
        gate: {
          criteria,
          instructions: "Which authored page should the person see next?",
          type: "choice",
        },
        ...fieldQuestions,
      },
      state: { prompt: params.prompt },
    });
    try {
      const ids = candidates.map((candidate) => candidate.id);
      const pick = validateChoiceAnswer(response.answers.gate, ids).choice;
      chosen = candidates.find((candidate) => candidate.id === pick) ?? chosen;
    } catch {
      chosen = pickFirst(candidates);
    }
    for (const field of chosen.optional_fields ?? []) {
      const answer = response.answers[`include_${chosen.id}_${field.id}`];
      if (!(answer?.type === "noul" && answer.noul >= INCLUDE_FLOOR)) {
        dropped.add(field.id);
      }
    }
  }
  const payload =
    chosen.kind === "surface"
      ? stripComponentIds(chosen.payload, dropped)
      : chosen.payload;
  const surface = gateSurfaceFor(chosen.kind, payload, chosen.data);
  return {
    gate_id: chosen.id,
    kind: chosen.kind,
    payload,
    surface,
    title: chosen.title?.trim() || chosen.id,
  };
}
