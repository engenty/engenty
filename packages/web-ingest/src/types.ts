/** Adapter / result discriminator — matches registered adapter ids. */
export type WebIngestProvider = "fetch" | "firecrawl";

export type WebIngestSectionKind = "html" | "markdown" | "text";

export interface WebIngestSection {
  content: string;
  kind: WebIngestSectionKind;
  locator?: string | null;
  metadata?: Record<string, unknown>;
  position: number;
  title?: string | null;
}

export type WebIngestMediaType =
  | "image"
  | "video"
  | "audio"
  | "iframe"
  | "document"
  | "other";

export interface WebIngestMedia {
  alt_text?: string | null;
  content_type?: string | null;
  description?: string | null;
  height?: number | null;
  media_type: WebIngestMediaType;
  metadata?: Record<string, unknown>;
  position: number;
  source_url: string;
  storage_intent?: "download" | "external";
  title?: string | null;
  width?: number | null;
}

export type WebIngestLinkType = "internal" | "external" | "anchor" | "asset";

export interface WebIngestLink {
  href: string;
  link_type: WebIngestLinkType;
  metadata?: Record<string, unknown>;
  normalized_href: string;
  position: number;
  rel?: string | null;
  text?: string | null;
  title?: string | null;
}

export interface WebIngestResult {
  bytes_read: number;
  content_type: string;
  final_url: string;
  links?: WebIngestLink[];
  markdown: string;
  media?: WebIngestMedia[];
  provider: WebIngestProvider;
  /** Original HTML returned by the provider, before local selector cleanup. */
  raw_html?: string;
  sections?: WebIngestSection[];
  /** Set when fetch used `htmlExtract.suggestPatternsWithLlm` and the model returned a title. */
  suggested_title?: string;
}
