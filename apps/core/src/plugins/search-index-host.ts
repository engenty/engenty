// Thin re-export of the search-index host helpers from `@engenty/plugin-sdk`.
//
// The actual implementation now lives in the SDK so non-core hosts (e.g.
// `apps/ai`) can register search-index providers against their own local
// registry without depending on `apps/core`. Existing core call sites keep
// importing from this path.

export {
  bindSearchIndexProviderEvents,
  createSearchIndexHost,
  resolveSearchOperationId,
  synthesizeSearchOperation,
} from "@engenty/plugin-sdk";
export { createSearchIndexRegistry } from "@engenty/search-index";
