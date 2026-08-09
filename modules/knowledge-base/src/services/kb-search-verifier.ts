import {
  readAiGatewayApiKeyFromEnv,
  resolveChatModelId,
} from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { Article, KbSearchResult } from "../schema/types.js";

const logger = createLogger({ name: "kb-search-verifier" });

const MAX_CHUNK_CHARS = 1200;
const MAX_SUMMARY_CHARS = 600;
const MAX_QUESTION_CHARS = 120;

const kbSearchVerifierOutputSchema = z.object({
  matches: z
    .array(
      z.object({
        article_id: z.string().describe("Candidate article id."),
        relevant: z
          .boolean()
          .describe(
            "True only when the article chunk or article metadata directly helps answer the query."
          ),
      })
    )
    .describe("One relevance decision per submitted candidate article."),
});

export interface KbSearchVerifierSettings {
  search_verifier_max_candidates: number;
  search_verifier_min_query_terms: number;
}

export interface KbSearchVerifierCandidate {
  article: Article | null;
  result: KbSearchResult;
}

export interface KbSearchVerifierOptions {
  candidates: KbSearchVerifierCandidate[];
  query: string;
  settings: KbSearchVerifierSettings;
}

export function countKbSearchQueryTerms(query: string): number {
  return query
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0).length;
}

export function shouldVerifyKbSearchQuery(
  query: string,
  settings: KbSearchVerifierSettings
): boolean {
  return (
    countKbSearchQueryTerms(query) >= settings.search_verifier_min_query_terms
  );
}

export function isKbSearchVerifierConfigured(): boolean {
  return Boolean(readAiGatewayApiKeyFromEnv());
}

function truncateForVerifier(value: string | null | undefined, max: number) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length > max
    ? `${normalized.slice(0, Math.max(0, max - 1))}…`
    : normalized;
}

function serializeCandidate(candidate: KbSearchVerifierCandidate) {
  const { article, result } = candidate;
  return {
    article_id: result.article_id,
    title: result.title,
    score: Number(result.score.toFixed(4)),
    status: article?.status ?? null,
    summary: truncateForVerifier(article?.summary, MAX_SUMMARY_CHARS),
    questions_answered: (article?.questions_answered ?? [])
      .slice(0, 8)
      .map((question) => truncateForVerifier(question, MAX_QUESTION_CHARS)),
    chunk_text: truncateForVerifier(result.chunk_text, MAX_CHUNK_CHARS),
  };
}

export async function verifyKbSearchResults(
  options: KbSearchVerifierOptions
): Promise<KbSearchResult[]> {
  const maxCandidates = Math.min(
    Math.max(options.settings.search_verifier_max_candidates, 1),
    20
  );
  const candidates = options.candidates.slice(0, maxCandidates);
  if (candidates.length === 0) {
    return [];
  }
  if (!isKbSearchVerifierConfigured()) {
    logger.warn("Skipping KB search verifier; AI Gateway is not configured");
    return candidates.map((candidate) => candidate.result);
  }

  const modelId = resolveChatModelId({ purpose: "routing" });
  const submitted = candidates.map(serializeCandidate);

  try {
    const { output } = await generateText({
      telemetry: { isEnabled: true },
      model: modelId,
      output: Output.object({ schema: kbSearchVerifierOutputSchema }),
      temperature: 0,
      prompt: `You verify semantic knowledge-base search candidates.

Return relevant=true only if the submitted article metadata or chunk contains information that directly matches the user's query. Reject generic, unrelated, or merely same-domain matches.

User query:
${options.query}

Submitted candidates as JSON:
${JSON.stringify(submitted, null, 2)}`,
    });

    const relevantById = new Map(
      output.matches.map((match) => [match.article_id, match.relevant])
    );
    return candidates
      .filter((candidate) => relevantById.get(candidate.result.article_id))
      .map((candidate) => candidate.result);
  } catch (error) {
    logger.warn("KB search verifier failed; returning unverified candidates", {
      error: String(error),
    });
    return candidates.map((candidate) => candidate.result);
  }
}
