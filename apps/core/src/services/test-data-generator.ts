import type { ZodType } from "zod";

/** Thrown when the LLM HTTP call fails after retries (includes status for API mapping). */
export class TestDataLlmHttpError extends Error {
  readonly httpStatus: number;

  constructor(httpStatus: number, message: string) {
    super(message);
    this.name = "TestDataLlmHttpError";
    this.httpStatus = httpStatus;
  }
}

const RETRYABLE_LLM_STATUSES = new Set([429, 502, 503]);
const MAX_LLM_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse `Retry-After` as delta-seconds or HTTP-date. */
function parseRetryAfterSeconds(header: string | null): number | undefined {
  if (!header?.trim()) {
    return;
  }
  const trimmed = header.trim();
  const asInt = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asInt) && String(asInt) === trimmed) {
    return Math.max(0, asInt);
  }
  const when = Date.parse(trimmed);
  if (!Number.isNaN(when)) {
    return Math.max(0, Math.ceil((when - Date.now()) / 1000));
  }
  return;
}

async function fetchOpenAiChatCompletion(params: {
  apiKey: string;
  body: Record<string, unknown>;
  logger: GenerateTestDataParams["logger"];
}): Promise<Response> {
  const { apiKey, body, logger } = params;
  let lastStatus = 0;

  for (let attempt = 0; attempt < MAX_LLM_ATTEMPTS; attempt++) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return response;
    }

    lastStatus = response.status;
    const canRetry =
      attempt < MAX_LLM_ATTEMPTS - 1 &&
      RETRYABLE_LLM_STATUSES.has(response.status);

    if (canRetry) {
      const headerSec = parseRetryAfterSeconds(
        response.headers.get("retry-after")
      );
      const baseBackoffMs = 1000 * 2 ** attempt;
      const jitterMs = Math.random() * 400;
      const fromHeaderMs =
        headerSec === undefined ? undefined : headerSec * 1000;
      const delayMs = Math.min(
        60_000,
        fromHeaderMs ?? baseBackoffMs + jitterMs
      );
      logger.warn(
        `OpenAI returned ${response.status}; retrying in ${Math.round(delayMs)}ms (${attempt + 2}/${MAX_LLM_ATTEMPTS})`
      );
      await sleep(delayMs);
      continue;
    }

    const text = await response.text();
    logger.error(`OpenAI API error ${response.status}: ${text}`);
    throw new TestDataLlmHttpError(
      response.status,
      `LLM API error: ${response.status}`
    );
  }

  throw new TestDataLlmHttpError(lastStatus, `LLM API error: ${lastStatus}`);
}

export interface GenerateTestDataParams {
  config: Record<string, unknown>;
  count: number;
  data_type: string;
  instructions?: string;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  module_id: string;
  recordSchema: ZodType;
  /** JSON schema or field description for the LLM prompt. */
  schemaDescription: string;
}

export interface GenerateTestDataResult {
  records: Record<string, unknown>[];
  warnings: string[];
}

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_INSTRUCTIONS_LEN = 2000;

function extractJsonArray(raw: string): unknown[] {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("[");
  if (start < 0) {
    return [];
  }
  let depth = 0;
  let end = -1;
  for (let i = start; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (c === "[" || c === "{") {
      depth++;
    } else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0 && c === "]") {
        end = i;
        break;
      }
    }
  }
  if (end < 0) {
    return [];
  }
  const json = trimmed.slice(start, end + 1);
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

export async function generateTestData(
  params: GenerateTestDataParams
): Promise<GenerateTestDataResult> {
  const {
    config,
    count,
    data_type,
    instructions = "",
    logger,
    module_id,
    recordSchema,
    schemaDescription,
  } = params;

  const warnings: string[] = [];
  const apiKey =
    String(config.testDataOpenAiApiKey ?? "").trim() ||
    String(process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error(
      "Test data generation requires OPENAI_API_KEY or config.testDataOpenAiApiKey"
    );
  }

  const model = String(config.testDataModel ?? "").trim() || DEFAULT_MODEL;
  const safeInstructions =
    instructions.length > MAX_INSTRUCTIONS_LEN
      ? `${instructions.slice(0, MAX_INSTRUCTIONS_LEN)}...`
      : instructions;
  if (instructions.length > MAX_INSTRUCTIONS_LEN) {
    warnings.push(
      `Instructions truncated to ${MAX_INSTRUCTIONS_LEN} characters.`
    );
  }

  const systemPrompt = `You are a test data generator. Output ONLY valid JSON. No markdown, no explanation.
- Return a JSON object with a "records" key containing an array of objects: { "records": [ {...}, {...} ] }
- Every object MUST include ALL required fields from the schema. Never omit required fields.
- Use snake_case for all field names.`;
  const userPrompt = `Generate exactly ${count} fake records for module "${module_id}", data type "${data_type}".

Schema (REQUIRED fields must appear in every record):
${schemaDescription}
${safeInstructions ? `\nAdditional instructions: ${safeInstructions}` : ""}

Return a JSON object: { "records": [ ... array of ${count} objects ... ] }. Use snake_case. Every record must include all required fields.`;

  const response = await fetchOpenAiChatCompletion({
    apiKey,
    logger,
    body: {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    },
  });

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) {
    throw new Error("Empty response from LLM");
  }

  let rawRecords: unknown[];
  try {
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) {
      rawRecords = parsed;
    } else if (parsed && typeof parsed === "object" && "records" in parsed) {
      rawRecords = Array.isArray((parsed as { records: unknown }).records)
        ? (parsed as { records: unknown[] }).records
        : [];
    } else if (parsed && typeof parsed === "object") {
      rawRecords = [parsed];
    } else {
      rawRecords = extractJsonArray(content);
    }
  } catch {
    rawRecords = extractJsonArray(content);
  }

  const records: Record<string, unknown>[] = [];
  for (let i = 0; i < rawRecords.length; i++) {
    const raw = rawRecords[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const obj = raw as Record<string, unknown>;
    try {
      const validated = recordSchema.parse(obj) as Record<string, unknown>;
      records.push(validated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Record ${i + 1} failed validation: ${msg}`);
    }
  }

  if (records.length < count) {
    warnings.push(
      `Requested ${count} records, but only ${records.length} passed validation.`
    );
  }

  return { records, warnings };
}
