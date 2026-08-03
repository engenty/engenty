// Remote channel provider interface — one file per platform under this folder.
//
// The provider set is defined IN CODE, not by a database enum: bindings carry
// a free-text `platform` column, and validity means "a registered provider
// says it's configured". Adding a platform = adding a file here and listing it
// in index.ts; no migration. (The `ChannelProvider` interface Mastra ships —
// OAuth connect, per-tenant credential injection — is the R4 evolution of this
// seam; this layer is the env-credential v1 with the same one-provider-one-file
// shape so R4 swaps the internals, not the layout.)

export interface RemoteChannelProvider {
  /**
   * Chat SDK adapter for this platform. Only called when `isConfigured()`
   * is true.
   */
  createAdapter(): unknown;
  /** Platform key as it appears on bindings and adapters (e.g. "slack"). */
  id: string;
  /** Whether this process holds the platform credentials (env, v1). */
  isConfigured(): boolean;
}
