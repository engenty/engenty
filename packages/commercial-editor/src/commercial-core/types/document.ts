import type { CommercialBlock } from "./blocks";
import type { CommercialSettings } from "./settings";

export interface CommercialDocumentInput {
  blocks: CommercialBlock[];
  currency: string;
  locale: string;
  phases_enabled?: boolean;
  settings: CommercialSettings;
  timeframe_from?: string | null;
  timeframe_until?: string | null;
}
