/** KB article / FAQ version history (list + detail payloads). */

export interface KbVersionSummary {
  created_at: string;
  created_by: string | null;
  version: number;
}

export interface KbVersionDetail extends KbVersionSummary {
  snapshot: Record<string, unknown>;
}
