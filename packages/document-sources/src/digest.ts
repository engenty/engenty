import { createHash } from "node:crypto";
import type { DocumentSourceRetrievedItem } from "./types.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Deterministic digest for storing webhook secrets (e.g. compare to `webhook_token_hash` column). */
export function hashDocumentSourceWebhookToken(token: string): string {
  return sha256(token.trim());
}

/** Content fingerprint for change detection on retrieved markdown. */
export function hashDocumentSourceItemContent(
  item: DocumentSourceRetrievedItem
): string {
  return sha256(
    JSON.stringify({
      final_url: item.final_url ?? item.source_url,
      item_key: item.item_key,
      links: item.links ?? [],
      markdown: item.markdown,
      media: item.media ?? [],
      sections: item.sections ?? [],
    })
  );
}
