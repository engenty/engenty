/** Browser-side document → markdown. Swap providers without changing upload. */

export interface BrowserDocParseResult {
  markdown: string;
  provider: string;
}

export interface BrowserDocParser {
  canParse(mimeType: string, filename?: string): boolean;
  readonly id: string;
  parse(input: {
    bytes: Uint8Array;
    filename: string;
    mimeType: string;
  }): Promise<BrowserDocParseResult | null>;
}
