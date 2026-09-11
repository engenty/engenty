/**
 * @engenty/doc-converter — Public API.
 */

export { getDocConverterCloudAvailability } from "./availability.js";
// Facade
export {
  Converter,
  type ConverterConfig,
  type ConverterProviderName,
} from "./converter.js";
// Interface
export type {
  ConversionOptions,
  ConversionResult,
  DocConverterProvider,
} from "./interface.js";
export {
  fetchMarkdownFromResultContentMetadata,
  LLAMA_PARSE_EXPAND_FIELDS,
  markdownFromLlamaCloudParsingResult,
} from "./llama-cloud-markdown.js";
export type { PageBreakAttrs, PageSlice, SplitPage } from "./page-break.js";
export {
  formatPageBreak,
  joinPagesWithBreaks,
  markdownFromPagedParseResult,
  PAGE_BREAK_TAG,
  splitMarkdownByPageBreaks,
} from "./page-break.js";
// Providers
export { GeminiProvider } from "./providers/gemini/index.js";
export { LiteParseProvider } from "./providers/liteparse/index.js";
export {
  LlamaParseProvider,
  type LlamaParseProviderConfig,
  type LlamaParseTier,
} from "./providers/llamaparse/index.js";
export { LocalProvider } from "./providers/local/index.js";
export {
  MistralOcrProvider,
  type MistralOcrProviderConfig,
} from "./providers/mistral/index.js";
