/**
 * Seed pricing rows applied at boot if no active row exists for a model.
 *
 * Rates are micros per 1M tokens (1 USD = 1_000_000 micros). Update by editing this
 * table or by inserting a new row with a more recent `valid_from` via the manage UI.
 *
 * Numbers reflect public list prices for major Vercel AI Gateway models as of
 * Q1 2026; unknown models default to a conservative $5/$15 per Mtok shape.
 */

export interface ModelPricingSeed {
  cached_input_per_mtok_micros: number;
  currency: string;
  input_per_mtok_micros: number;
  model_id: string;
  output_per_mtok_micros: number;
  reasoning_per_mtok_micros: number;
}

const USD = "usd";

export const DEFAULT_MODEL_PRICING_SEEDS: readonly ModelPricingSeed[] = [
  {
    model_id: "openai/gpt-5",
    currency: USD,
    input_per_mtok_micros: 1_250_000,
    output_per_mtok_micros: 10_000_000,
    cached_input_per_mtok_micros: 125_000,
    reasoning_per_mtok_micros: 10_000_000,
  },
  {
    model_id: "openai/gpt-5-mini",
    currency: USD,
    input_per_mtok_micros: 250_000,
    output_per_mtok_micros: 2_000_000,
    cached_input_per_mtok_micros: 25_000,
    reasoning_per_mtok_micros: 2_000_000,
  },
  {
    model_id: "openai/gpt-5.6-luna",
    currency: USD,
    input_per_mtok_micros: 200_000,
    output_per_mtok_micros: 1_200_000,
    cached_input_per_mtok_micros: 20_000,
    reasoning_per_mtok_micros: 1_200_000,
  },
  {
    model_id: "openai/gpt-5-nano",
    currency: USD,
    input_per_mtok_micros: 50_000,
    output_per_mtok_micros: 400_000,
    cached_input_per_mtok_micros: 5000,
    reasoning_per_mtok_micros: 400_000,
  },
  {
    model_id: "openai/gpt-oss-20b",
    currency: USD,
    input_per_mtok_micros: 70_000,
    output_per_mtok_micros: 300_000,
    cached_input_per_mtok_micros: 7000,
    reasoning_per_mtok_micros: 300_000,
  },
  {
    model_id: "openai/gpt-4.1",
    currency: USD,
    input_per_mtok_micros: 2_000_000,
    output_per_mtok_micros: 8_000_000,
    cached_input_per_mtok_micros: 500_000,
    reasoning_per_mtok_micros: 8_000_000,
  },
  {
    model_id: "openai/gpt-4.1-mini",
    currency: USD,
    input_per_mtok_micros: 400_000,
    output_per_mtok_micros: 1_600_000,
    cached_input_per_mtok_micros: 100_000,
    reasoning_per_mtok_micros: 1_600_000,
  },
  {
    model_id: "openai/gpt-4.1-nano",
    currency: USD,
    input_per_mtok_micros: 100_000,
    output_per_mtok_micros: 400_000,
    cached_input_per_mtok_micros: 25_000,
    reasoning_per_mtok_micros: 400_000,
  },
  {
    model_id: "openai/gpt-4o",
    currency: USD,
    input_per_mtok_micros: 2_500_000,
    output_per_mtok_micros: 10_000_000,
    cached_input_per_mtok_micros: 1_250_000,
    reasoning_per_mtok_micros: 10_000_000,
  },
  {
    model_id: "openai/gpt-4o-mini",
    currency: USD,
    input_per_mtok_micros: 150_000,
    output_per_mtok_micros: 600_000,
    cached_input_per_mtok_micros: 75_000,
    reasoning_per_mtok_micros: 600_000,
  },
  {
    model_id: "anthropic/claude-sonnet-4",
    currency: USD,
    input_per_mtok_micros: 3_000_000,
    output_per_mtok_micros: 15_000_000,
    cached_input_per_mtok_micros: 300_000,
    reasoning_per_mtok_micros: 15_000_000,
  },
  {
    model_id: "anthropic/claude-haiku-4",
    currency: USD,
    input_per_mtok_micros: 800_000,
    output_per_mtok_micros: 4_000_000,
    cached_input_per_mtok_micros: 80_000,
    reasoning_per_mtok_micros: 4_000_000,
  },
  {
    model_id: "google/gemini-2.5-pro",
    currency: USD,
    input_per_mtok_micros: 1_250_000,
    output_per_mtok_micros: 10_000_000,
    cached_input_per_mtok_micros: 312_500,
    reasoning_per_mtok_micros: 10_000_000,
  },
  {
    model_id: "google/gemini-2.5-flash",
    currency: USD,
    input_per_mtok_micros: 300_000,
    output_per_mtok_micros: 2_500_000,
    cached_input_per_mtok_micros: 75_000,
    reasoning_per_mtok_micros: 2_500_000,
  },
];

/** Conservative fallback when a model has no catalog row (unknown vendor / new release). */
export const FALLBACK_MODEL_PRICING: ModelPricingSeed = {
  model_id: "*",
  currency: USD,
  input_per_mtok_micros: 5_000_000,
  output_per_mtok_micros: 15_000_000,
  cached_input_per_mtok_micros: 500_000,
  reasoning_per_mtok_micros: 15_000_000,
};
