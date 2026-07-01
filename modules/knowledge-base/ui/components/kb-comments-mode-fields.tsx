/**
 * Shared comments policy selector — KB root, category, and article settings.
 */

import { useTranslation } from "@engenty/i18n/ui";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import type {
  KbCommentsModeBinding,
  KbEffectiveCommentsMode,
  KbRootCommentsMode,
} from "../../src/schema/comments.js";

type KbCommentsModeValue = KbRootCommentsMode | KbCommentsModeBinding;

export interface KbCommentsModeSelectProps {
  className?: string;
  id?: string;
  onChange: (value: KbCommentsModeValue) => void;
  showInherit?: boolean;
  value: KbCommentsModeValue;
}

const MODE_OPTIONS = (
  showInherit: boolean
): Array<{ id: KbCommentsModeValue; labelKey: string }> => [
  ...(showInherit
    ? [{ id: "inherit" as const, labelKey: "comments.mode.inherit" }]
    : []),
  { id: "none", labelKey: "comments.mode.none" },
  { id: "enabled", labelKey: "comments.mode.enabled" },
  { id: "closed", labelKey: "comments.mode.closed" },
];

export function KbCommentsModeSelect({
  className,
  id = "kb-comments-mode",
  onChange,
  showInherit = true,
  value,
}: KbCommentsModeSelectProps) {
  const { t } = useTranslation("kb");
  const options = MODE_OPTIONS(showInherit);

  return (
    <Select
      onValueChange={(next) => onChange(next as KbCommentsModeValue)}
      value={value}
    >
      <SelectTrigger className={className ?? "w-full"} id={id}>
        <SelectValue>
          {t(
            options.find((o) => o.id === value)?.labelKey ??
              `comments.mode.${value}`
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {t(option.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface KbCommentsModeFieldsProps {
  effectiveHint?: KbEffectiveCommentsMode | null;
  id?: string;
  onChange: (value: KbCommentsModeValue) => void;
  showInherit?: boolean;
  value: KbCommentsModeValue;
}

export function KbCommentsModeFields({
  effectiveHint,
  id = "kb-comments-mode",
  onChange,
  showInherit = true,
  value,
}: KbCommentsModeFieldsProps) {
  const { t } = useTranslation("kb");

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Label className="shrink-0 text-sm" htmlFor={id}>
          {t("comments.settings_field_label")}
        </Label>
        <KbCommentsModeSelect
          className="w-full sm:max-w-[16rem]"
          id={id}
          onChange={onChange}
          showInherit={showInherit}
          value={value}
        />
      </div>
      {showInherit && value === "inherit" && effectiveHint ? (
        <p className="text-muted-foreground text-xs">
          {t("comments.mode.effective_hint", {
            mode: t(`comments.mode.${effectiveHint}`),
          })}
        </p>
      ) : null}
    </div>
  );
}
