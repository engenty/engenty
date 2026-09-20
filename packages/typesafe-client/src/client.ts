import { Agent, fetch as undiciFetch } from "undici";
import type {
  ModelCard,
  SystemOneRequest,
  SystemOneResponse,
} from "./types.js";

export const TYPESAFE_API_KEY_ENV = "TYPESAFE_API_KEY";
export const TYPESAFE_MODEL_ENV = "TYPESAFE_MODEL";
export const DEFAULT_TYPESAFE_BASE_URL = "https://api.typesafe.ai";
export const DEFAULT_TYPESAFE_MODEL = "jev-latest";
/**
 * Vercel AI Gateway speaks the TypeSafe API under this prefix (same request
 * and response shapes, TypeSafe field names, `confidence` per answer). The
 * gateway key authenticates; billing lands on the AI Gateway account.
 */
export const AI_GATEWAY_API_KEY_ENV = "AI_GATEWAY_API_KEY";
export const VERCEL_TYPESAFE_BASE_URL = "https://ai-gateway.vercel.sh/typesafe";
export const VERCEL_JEV_MODEL = "typesafe-ai/jev";
/** A keyed GET that spends no tokens: 200 for a live key, 401 for a dead one. */
export const TYPESAFE_PROBE_PATH = "/v1/models";

/** Status codes worth a retry: rate limit, overloaded, unavailable. */
const RETRYABLE_STATUS = new Set([429, 503, 529]);

/**
 * How long an idle connection to Jev stays open. Node's default is 4 s, and a
 * classifier that runs once per turn or per search is idle longer than that
 * almost every time — measured 2026-09-20: 300 ms warm, 400+ ms after a
 * 6 s pause (a fresh TLS handshake), 1.4 s cold in a new process.
 */
const KEEP_ALIVE_MS = 60_000;
let keepAliveDispatcher: Agent | null = null;

/** The default fetch: Node's undici with a long keep-alive, one pool per process. */
function keepAliveFetch(): typeof fetch {
  if (!keepAliveDispatcher) {
    keepAliveDispatcher = new Agent({
      keepAliveMaxTimeout: KEEP_ALIVE_MS,
      keepAliveTimeout: KEEP_ALIVE_MS,
    });
  }
  const dispatcher = keepAliveDispatcher;
  return (input, init) =>
    undiciFetch(input as string, {
      ...(init as Record<string, unknown>),
      dispatcher,
    }) as unknown as Promise<Response>;
}

export interface TypeSafeClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Default model for `systemOne` when the request names none. */
  model?: string;
  /** Total attempts including the first. Default 3. */
  retries?: number;
  timeoutMs?: number;
}

export class TypeSafeError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "TypeSafeError";
    this.status = status;
  }
}

/** The key as the caller's environment holds it (`process.env` on a server). */
export function readTypeSafeApiKey(
  env: Readonly<Record<string, string | undefined>>
): string | null {
  const value = env[TYPESAFE_API_KEY_ENV]?.trim();
  return value ? value : null;
}

export type TypeSafeRoute = "typesafe" | "vercel-gateway";

export interface ResolvedTypeSafeClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  route: TypeSafeRoute;
}

/**
 * Which door to Jev this environment opens: TypeSafe's own API when a
 * TypeSafe key is set, else the Vercel AI Gateway's TypeSafe-compatible
 * route on the gateway key. `TYPESAFE_MODEL` overrides the model on either.
 * Null when neither key is present.
 */
export function resolveTypeSafeClientOptions(
  env: Readonly<Record<string, string | undefined>>
): ResolvedTypeSafeClientOptions | null {
  const override = env[TYPESAFE_MODEL_ENV]?.trim();
  const direct = readTypeSafeApiKey(env);
  if (direct) {
    return {
      apiKey: direct,
      baseUrl: DEFAULT_TYPESAFE_BASE_URL,
      model: override || DEFAULT_TYPESAFE_MODEL,
      route: "typesafe",
    };
  }
  const gateway = env[AI_GATEWAY_API_KEY_ENV]?.trim();
  if (gateway) {
    return {
      apiKey: gateway,
      baseUrl: VERCEL_TYPESAFE_BASE_URL,
      model: override || VERCEL_JEV_MODEL,
      route: "vercel-gateway",
    };
  }
  return null;
}

/**
 * Thin client over the two endpoints we use. No SDK: the API is one POST,
 * and keeping the surface here lets the browser loop, the settings probe
 * and tests share one retry policy.
 */
export class TypeSafeClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;
  private readonly retries: number;
  private readonly timeoutMs: number;

  constructor(options: TypeSafeClientOptions) {
    if (!options.apiKey.trim()) {
      throw new TypeSafeError(`${TYPESAFE_API_KEY_ENV} is empty`, null);
    }
    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl ?? DEFAULT_TYPESAFE_BASE_URL).replace(
      /\/+$/,
      ""
    );
    this.fetchImpl = options.fetchImpl ?? keepAliveFetch();
    this.model = options.model ?? DEFAULT_TYPESAFE_MODEL;
    this.retries = Math.max(1, options.retries ?? 3);
    this.timeoutMs = options.timeoutMs ?? 25_000;
  }

  async systemOne(request: SystemOneRequest): Promise<SystemOneResponse> {
    const body = JSON.stringify({
      model: request.model ?? this.model,
      questions: request.questions,
      state: request.state,
    });
    const response = await this.send("/v1/systemone", {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    return (await response.json()) as SystemOneResponse;
  }

  async listModels(): Promise<ModelCard[]> {
    const response = await this.send(TYPESAFE_PROBE_PATH, { method: "GET" });
    const parsed = (await response.json()) as
      | ModelCard[]
      | { data?: ModelCard[]; models?: ModelCard[] };
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return parsed.data ?? parsed.models ?? [];
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    let lastError: TypeSafeError | null = null;
    for (let attempt = 0; attempt < this.retries; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          ...init,
          headers: {
            ...(init.headers as Record<string, string> | undefined),
            authorization: `Bearer ${this.apiKey}`,
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        throw new TypeSafeError(
          `typesafe_unreachable: ${error instanceof Error ? error.message : String(error)}`,
          null
        );
      }
      if (response.ok) {
        return response;
      }
      lastError = new TypeSafeError(
        `typesafe_http_${response.status}`,
        response.status
      );
      if (
        !RETRYABLE_STATUS.has(response.status) ||
        attempt === this.retries - 1
      ) {
        throw lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
    throw lastError ?? new TypeSafeError("typesafe_unavailable", null);
  }
}
