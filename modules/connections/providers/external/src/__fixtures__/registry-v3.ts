/**
 * Recorded integrations.sh payloads (`version: 3`), captured 2026-09-05 and
 * trimmed to the fields this module reads (`basis`/`evidence` provenance and
 * icons dropped; long `setup` prose dropped from credentials). CI never calls
 * the live registry — these files are the contract.
 *
 * Coverage: several surfaces per domain (stripe, resend), an HTTP surface with
 * `spec` (stripe, plaid) and `specAlternates` (plaid, resend), MCP transports
 * (streamable-http, sse, stdio-only), static `requiredHeaders` (github,
 * notion), URL `variables` (atlassian), auth mechanics from `http`,
 * `well-known`, `spec` and `cli` sources, and a search hit carrying
 * `specOverrides` (figma).
 */

import {
  parseSearchResponse,
  parseSurfacePayload,
  type RegistryDiscoverPayload,
  type RegistrySearchResult,
} from "../registry-client.js";
import searchJson from "./registry-search.json" with { type: "json" };
import surfacesJson from "./registry-surfaces.json" with { type: "json" };

type SurfaceFixtureName = keyof typeof surfacesJson;

/** Parsed through the real wire schema, so defaults apply as in production. */
export function surfaceFixture(
  name: SurfaceFixtureName
): RegistryDiscoverPayload {
  return parseSurfacePayload(surfacesJson[name]);
}

export function searchFixture(
  name: keyof typeof searchJson
): RegistrySearchResult[] {
  return parseSearchResponse(searchJson[name]);
}
