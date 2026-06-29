/**
 * Document Converter — Provider interface.
 *
 * Following the banking provider architecture:
 * - Abstract interface defines the contract
 * - Concrete providers implement for specific services
 * - Facade class selects the right provider
 */

/* ── Conversion result ── */

export interface ConversionResult {
  /** Converted content as markdown */
  markdown: string;
  /** Document metadata extracted during conversion */
  metadata: {
    title?: string;
    author?: string;
    page_count?: number;
    word_count?: number;
    language?: string;
  };
  /** Original file information */
  source: {
    filename: string;
    mime_type: string;
    size_bytes: number;
  };
  /** Converted content as TipTap JSON (optional — some providers may not produce this) */
  tiptap_json?: Record<string, unknown>;
}

/* ── Provider options ── */

export interface ConversionOptions {
  /** Whether to include images (as base64 or URLs). Provider-specific; not wired for LiteParse. */
  include_images?: boolean;
  /** Language hint for OCR/parsing */
  language?: string;
  /** Max pages to process (for PDFs) */
  max_pages?: number;
}

/* ── Provider interface ── */

export interface DocConverterProvider {
  /** Check if this provider can handle the given file */
  canConvert(mimeType: string): boolean;

  /** Convert a document to markdown */
  convert(
    data: Uint8Array,
    filename: string,
    mimeType: string,
    options?: ConversionOptions
  ): Promise<ConversionResult>;
  /** Provider identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** MIME types this provider supports */
  readonly supportedTypes: string[];
}
