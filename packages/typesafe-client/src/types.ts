// The TypeSafe System One API (https://docs.typesafe.ai/api): one POST with a
// `state` and a map of typed questions; every question is answered in the
// same call, in parallel and in isolation. The model is a classifier — it
// returns a choice, a score or a probability with a calibrated distribution,
// never generated text.

/** Anything JSON: instructions and criteria may be strings or structured. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Free-form guidance; objects are encouraged when a question has parts. */
export type Description = JsonValue;

export interface ChoiceQuestion {
  /** Option id → what it covers. `null` = the id is self-explanatory. */
  criteria: Record<string, Description>;
  instructions?: Description;
  type: "choice";
}

export interface ScoreQuestion {
  /**
   * Ordered levels, lowest first. An ARRAY, unlike `choice`: the answer's
   * `score` is a position on this scale and its probabilities are keyed by
   * index (verified against the gateway 2026-09-20; an object is a 400).
   */
  criteria: Description[];
  instructions?: Description;
  type: "score";
}

export interface NoulQuestion {
  criteria?: { false?: Description; true?: Description };
  instructions: Description;
  type: "noul";
}

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface ChoiceAnswer {
  choice: string;
  /** 0–1, derived from how concentrated the distribution is. */
  confidence: number;
  probabilities: Record<string, number>;
  type: "choice";
}

export interface ScoreAnswer {
  confidence: number;
  /** Index → the criterion at that position, echoed back. */
  legend?: Record<string, Description>;
  /** Keyed by criterion index ("0", "1", …). */
  probabilities: Record<string, number>;
  /** Expected index on the scale, e.g. 1.98 on three levels. */
  score: number;
  type: "score";
}

export interface NoulAnswer {
  /** P(yes), 0–1. */
  noul: number;
  type: "noul";
}

export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface SystemOneRequest {
  model?: string;
  questions: Record<string, Question>;
  state: JsonValue;
}

export interface SystemOneUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface SystemOneResponse {
  answers: Record<string, Answer>;
  model: string;
  usage?: SystemOneUsage;
}

export interface ModelCard {
  id: string;
  [key: string]: JsonValue | undefined;
}

/**
 * Anything that answers System One questions: TypeSafe's own client, or an
 * LLM answering the same questions through structured output. Callers ask
 * through this so the classifier binding, not the caller, picks the engine.
 */
export interface ClassifierClient {
  systemOne(request: SystemOneRequest): Promise<SystemOneResponse>;
}
