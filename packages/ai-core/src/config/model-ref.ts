/**
 * A **model ref**: one string that names a model *and* the gateway serving it.
 *
 * The catalog keeps the gateway in its own column (`ai.model.gateway`) and the
 * model id clean — that stays true. But a gateway is not always next to the id:
 * a tenant's `ai.config` field, an agent's `modelOverride`, a session pick and
 * an `AI_*_MODEL` env var are each ONE string, and every one of them now has to
 * be able to say "this model, on OpenRouter". Adding a parallel gateway field to
 * each of those would mean a schema change per surface and a second value that
 * can drift out of step with the first.
 *
 * So a ref is `<gateway>:<model id>`, and a bare id means the default gateway.
 * `openai/gpt-5.6-luna` and `vercel:openai/gpt-5.6-luna` are the same model —
 * which is why every existing stored value keeps working untouched.
 *
 * **Why the head is matched against a known set rather than just split.**
 * OpenRouter's own ids contain colons: `meta-llama/llama-3.1-8b-instruct:free`,
 * `openai/gpt-4o:extended`. Splitting on the first colon would read `free` as a
 * model on the `meta-llama/llama-3.1-8b-instruct` gateway. Gateway ids never
 * contain `/` and are a closed, registered set, so requiring the head to BE a
 * known gateway makes the two cases impossible to confuse.
 *
 * This is deliberately not the old `openrouter/openai/gpt-oss-20b` spelling. A
 * slash prefix is indistinguishable from the `provider/model` id format — that
 * ambiguity is the bug the gateway column was introduced to fix (see migration
 * `20260726160000_ai_model_gateway.sql`). A colon against a closed set is not
 * ambiguous.
 */

/** The gateway a bare model id is served by. */
export const DEFAULT_MODEL_GATEWAY_ID = "vercel";

export const OPENROUTER_GATEWAY_ID = "openrouter";

/**
 * The vendors reached directly, without a gateway in between. Their catalog
 * rows keep the `provider/model` id shape (`openai/gpt-4o`,
 * `anthropic/claude-sonnet-4-5`) so that provider grants, pricing rows and the
 * `/` shape check treat them exactly like the same model on a gateway; the
 * vendor prefix is dropped again at the wire (see `vendorModelId`).
 */
export const OPENAI_GATEWAY_ID = "openai";
export const ANTHROPIC_GATEWAY_ID = "anthropic";

/** Opper: an OpenAI-compatible gateway with an EU footprint. */
export const OPPER_GATEWAY_ID = "opper";

/**
 * Gateways the platform ships. Registration in `apps/ai/src/model-gateways` is
 * the runtime source of truth; this is the vocabulary shared with the browser,
 * which has no registry. Adding a built-in gateway means adding it here too, or
 * its refs parse as bare model ids.
 */
export const MODEL_GATEWAY_IDS: readonly string[] = [
  DEFAULT_MODEL_GATEWAY_ID,
  OPENROUTER_GATEWAY_ID,
  OPENAI_GATEWAY_ID,
  ANTHROPIC_GATEWAY_ID,
  OPPER_GATEWAY_ID,
];

/**
 * The id a direct vendor expects on the wire. The catalog says
 * `openai/gpt-4o`; OpenAI's API wants `gpt-4o`. Only the vendor's own prefix
 * is stripped, and only for the two direct gateways — a gateway's ids
 * (`openrouter`, `opper`) already carry the vendor and go through untouched.
 */
export function vendorModelId(gateway: string, modelId: string): string {
  const head = gateway.trim().toLowerCase();
  if (head !== OPENAI_GATEWAY_ID && head !== ANTHROPIC_GATEWAY_ID) {
    return modelId;
  }
  const prefix = `${head}/`;
  return modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
}

export interface ModelRef {
  gateway: string;
  modelId: string;
}

const REF_SEPARATOR = ":";

function knownSet(known?: readonly string[]): ReadonlySet<string> {
  return new Set(known ?? MODEL_GATEWAY_IDS);
}

/**
 * Split a ref into its gateway and model id. A value with no recognised gateway
 * head — which is every model id written before this existed — resolves to the
 * default gateway.
 *
 * Pass `known` when a deployment has registered a gateway beyond the built-ins.
 */
export function parseModelRef(
  raw: string,
  known?: readonly string[]
): ModelRef {
  const value = raw.trim();
  const separator = value.indexOf(REF_SEPARATOR);
  if (separator > 0) {
    const head = value.slice(0, separator);
    // A gateway id never contains a slash; a `provider/model` id always does.
    // Checking membership makes the `…instruct:free` case fall through here.
    if (!head.includes("/") && knownSet(known).has(head.toLowerCase())) {
      return {
        gateway: head.toLowerCase(),
        modelId: value.slice(separator + REF_SEPARATOR.length).trim(),
      };
    }
  }
  return { gateway: DEFAULT_MODEL_GATEWAY_ID, modelId: value };
}

/**
 * Render a gateway + model id as one string. The default gateway is left
 * implicit so a Vercel-only install never sees a ref it did not write — every
 * stored value, log line and usage row stays byte-identical to before.
 */
export function formatModelRef(ref: ModelRef): string {
  const modelId = ref.modelId.trim();
  const gateway = ref.gateway.trim().toLowerCase();
  if (!gateway || gateway === DEFAULT_MODEL_GATEWAY_ID || !modelId) {
    return modelId;
  }
  return `${gateway}${REF_SEPARATOR}${modelId}`;
}

/**
 * The bare model id, with any gateway head removed.
 *
 * Use this at every boundary that means "which model" rather than "which model,
 * where": usage rows, catalog lookups, governance grants, and anything shown to
 * a user next to a separate gateway label.
 */
export function modelIdOfRef(raw: string, known?: readonly string[]): string {
  return parseModelRef(raw, known).modelId;
}

/** The gateway a ref names, or the default when it names none. */
export function gatewayOfRef(raw: string, known?: readonly string[]): string {
  return parseModelRef(raw, known).gateway;
}

/** True when the ref names a gateway other than the default. */
export function isNonDefaultGatewayRef(
  raw: string,
  known?: readonly string[]
): boolean {
  return gatewayOfRef(raw, known) !== DEFAULT_MODEL_GATEWAY_ID;
}
