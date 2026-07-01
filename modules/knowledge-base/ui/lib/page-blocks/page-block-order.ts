import type {
  KbPageBlock,
  KbPageLayoutSettings,
} from "../../../src/schema/page-blocks.js";
import { updatePageBlock } from "../../../src/schema/page-blocks.js";

export function patchPageBlock(
  settings: KbPageLayoutSettings,
  blockId: string,
  patch: Partial<KbPageBlock>
): KbPageLayoutSettings {
  return updatePageBlock(settings, blockId, patch);
}

export function patchPageBlockHeadline(
  settings: KbPageLayoutSettings,
  blockId: string,
  headline: string | null
): KbPageLayoutSettings {
  return updatePageBlock(settings, blockId, {
    headline,
  } as Partial<KbPageBlock>);
}
