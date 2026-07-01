/**
 * Tag picker for KB-scoped entities: lists tags, toggles selection, creates new tags.
 */

import type { Dispatch, SetStateAction } from "react";
import { KbTagPickerBody } from "./kb-tag-picker-body.js";

export interface KbTagPickerProps {
  kbId: string;
  onSelectedTagIdsChange: Dispatch<SetStateAction<string[]>>;
  selectedTagIds: string[];
}

export function KbTagPicker(props: KbTagPickerProps) {
  return <KbTagPickerBody {...props} />;
}
