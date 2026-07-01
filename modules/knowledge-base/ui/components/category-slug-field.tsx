/**
 * Inline slug row — view/edit/regenerate pattern shared by category surfaces.
 */

import { useTranslation } from "@engenty/i18n/ui";
import { buttonVariants, Input } from "@engenty/ui-core";
import { AnimatedRefreshIcon } from "@engenty/ui-icons";
import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  sanitizeCategorySlug,
  slugifyCategoryName,
} from "./category-settings-dialog-body.js";

export function CategorySlugField({
  disabled,
  name,
  onRegenerate,
  onSlugChange,
  resetKey,
  slug,
}: {
  disabled: boolean;
  name: string;
  onRegenerate?: () => void;
  onSlugChange: (slug: string) => void;
  resetKey: string;
  slug: string;
}) {
  const { t } = useTranslation("kb");
  const [editing, setEditing] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditing(false);
  }, [resetKey]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function handleRegenerate() {
    setSpinning(true);
    if (onRegenerate) {
      onRegenerate();
    } else {
      onSlugChange(slugifyCategoryName(name));
    }
    window.setTimeout(() => setSpinning(false), 400);
  }

  if (disabled) {
    return (
      <p className="font-mono text-muted-foreground text-sm">{slug || "—"}</p>
    );
  }

  if (editing) {
    return (
      <Input
        className="h-7 max-w-xs font-mono text-sm"
        maxLength={128}
        onBlur={() => setEditing(false)}
        onChange={(event) =>
          onSlugChange(sanitizeCategorySlug(event.target.value))
        }
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            setEditing(false);
          }
        }}
        ref={inputRef}
        value={slug}
      />
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <span className="min-w-0 truncate font-mono text-muted-foreground text-sm">
        {slug || "—"}
      </span>
      <button
        aria-label={t("category.settings.slug_edit", "Edit slug")}
        className={buttonVariants({
          className: "h-7 w-7 shrink-0 text-muted-foreground",
          size: "icon",
          variant: "ghost",
        })}
        onClick={() => setEditing(true)}
        type="button"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        aria-label={t(
          "category.settings.slug_regenerate",
          "Regenerate slug from name"
        )}
        className={buttonVariants({
          className: "h-7 w-7 shrink-0 text-muted-foreground",
          size: "icon",
          variant: "ghost",
        })}
        onClick={handleRegenerate}
        type="button"
      >
        <AnimatedRefreshIcon play={spinning ? "always" : "hover"} size="xs" />
      </button>
    </div>
  );
}
