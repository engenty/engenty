import type { ReRanker, SearchCandidate, Verifier } from "./contracts.js";

export function createWeightedScoreReranker<
  TCandidate extends SearchCandidate = SearchCandidate,
>(
  options: {
    source_weights?: Record<string, number>;
    tie_breaker?: (left: TCandidate, right: TCandidate) => number;
  } = {}
): ReRanker<TCandidate> {
  const sourceWeights = options.source_weights ?? {};
  return {
    rerank({ candidates }) {
      return candidates.toSorted((left, right) => {
        const leftScore = weightedScore(left, sourceWeights);
        const rightScore = weightedScore(right, sourceWeights);
        return (
          rightScore - leftScore ||
          options.tie_breaker?.(left, right) ||
          left.doc_id.localeCompare(right.doc_id)
        );
      });
    },
  };
}

export function createMinimumSignalVerifier<
  TCandidate extends SearchCandidate = SearchCandidate,
>(
  options: {
    allow_empty_query?: boolean;
    has_access?: (candidate: TCandidate) => boolean;
    minimum_scores?: Record<string, number>;
  } = {}
): Verifier<TCandidate> {
  const minimumScores = options.minimum_scores ?? {
    fts: Number.MIN_VALUE,
    semantic: 0.72,
    trigram: 0.18,
  };
  return {
    verify({ candidates, query }) {
      const hasQuery = query.trim().length > 0;
      return candidates.filter((candidate) => {
        if (options.has_access && !options.has_access(candidate)) {
          return false;
        }
        if (!hasQuery) {
          return options.allow_empty_query ?? true;
        }
        return hasMinimumSignal(candidate, minimumScores);
      });
    },
  };
}

function weightedScore(
  candidate: SearchCandidate,
  sourceWeights: Record<string, number>
): number {
  let score = candidate.score;
  for (const [source, weight] of Object.entries(sourceWeights)) {
    score += (candidate.source_scores[source] ?? 0) * weight;
  }
  return score;
}

function hasMinimumSignal(
  candidate: SearchCandidate,
  minimumScores: Record<string, number>
): boolean {
  return Object.entries(minimumScores).some(
    ([source, minimum]) => (candidate.source_scores[source] ?? 0) >= minimum
  );
}
