import type { JsonValue } from "@engenty/ag-ui-bridge";
import { useEngentyFrontendTool } from "@engenty/ai-ui";
import { OFFER_FILE_DOWNLOADS_SPEC } from "./definition.js";
import { runOfferFileDownloadsFrontendTool } from "./run.js";

export function useRegisterOfferFileDownloadsFrontendTool(): void {
  // run.js stays the execution authority (filename derivation, output envelope);
  // the zod schema only types the args the agent sees.
  useEngentyFrontendTool({
    ...OFFER_FILE_DOWNLOADS_SPEC,
    handler: (input): JsonValue =>
      runOfferFileDownloadsFrontendTool(input) as unknown as JsonValue,
  });
}
