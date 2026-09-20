export {
  ACT,
  buildActionSpace,
  buildQuestions,
  describeTarget,
  operationOf,
  TARGET_HEAD,
} from "./action-space.js";
export {
  isFastLoopEnabled,
  resolveFastLoopMaxSteps,
  resolveFastLoopMinMargin,
} from "./config.js";
export {
  type Decision,
  decide,
  type HistoryEntry,
  type ScoredStep,
  TIEBREAK_MIN_PROBABILITY,
  type Tiebreak,
  tiebreak,
} from "./decide.js";
export {
  FastLoopDriver,
  type FastLoopPage,
  fingerprint,
  StalePageError,
} from "./driver.js";
export {
  type FastLoopResult,
  type FastLoopStatus,
  type FastLoopStep,
  type RunFastLoopInput,
  runFastLoop,
} from "./run.js";
export type { PageSnapshot, SnapshotAction } from "./snapshot.js";
export {
  extractSpans,
  pickSpans,
  SPAN_MIN_MARGIN,
  type SpanPick,
} from "./span-picker.js";
export {
  buildFieldContext,
  createFieldText,
  type FieldContext,
  type FieldTextFn,
  type FieldTextOptions,
  type FieldTextResult,
  reasoningOptions,
  resolveTextHelperModelId,
} from "./text-helper.js";
