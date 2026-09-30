// Space – the first space: its tile (an icon in a carousel, like the copilot's
// face, over a row of colours) and its name. The tenant already has a default
// space (a database trigger makes it); this names it, re-keys it and gives it
// the tile the rail shows. Its apps stay as they are.

import { spaceKeyFromName } from "@engenty/ai-core/browser";
import {
  railSpaceInitials,
  SPACE_COLORS,
  SPACE_ICONS,
} from "@engenty/app-shell";
import { cn, Input } from "@engenty/ui-core";
import { Check, Lock, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import type {
  SetupCatalog,
  SpaceVisibility,
} from "../../lib/initial-setup-workspace";
import type { SetupCopy } from "../../lib/setup-wizard-i18n";
import type { SetupSpace, TenantSetupApi } from "../../lib/tenant-setup-api";
import {
  ErrorLine,
  SETUP_INPUT_CLASS,
  SetupChoice,
  SubmitButton,
} from "./setup-bits";
import { SetupCarousel } from "./setup-carousel";

/** The carousel's stand-in for "no icon": the tile shows the initials. */
const INITIALS = "initials";

const ICONS: readonly string[] = [INITIALS, ...SPACE_ICONS];

export interface SpaceLook {
  color: string;
  /** Null shows the name's initials. */
  icon: string | null;
}

export function SpaceStep({
  api,
  catalog,
  copy,
  fallback,
  look,
  name,
  onComplete,
  onLookChange,
  onNameChange,
  onVisibilityChange,
  userId,
  visibility,
}: {
  api: TenantSetupApi;
  catalog: SetupCatalog;
  copy: SetupCopy["space"];
  /** Whose initials the tile shows while the name is empty. */
  fallback: string;
  look: SpaceLook;
  name: string;
  onComplete: (space: SetupSpace) => void;
  onLookChange: (look: SpaceLook) => void;
  onNameChange: (name: string) => void;
  onVisibilityChange: (visibility: SpaceVisibility) => void;
  userId: string;
  visibility: SpaceVisibility;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initials = railSpaceInitials(name.trim() || fallback);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError(copy.required);
      return;
    }
    setSubmitting(true);
    try {
      onComplete(
        await api.ensureFirstSpace({
          baseline: catalog.baseline,
          color: look.color,
          icon: look.icon,
          name: trimmed,
          userId,
          visibility,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-7" noValidate onSubmit={submit}>
      <div className="flex flex-col gap-4">
        <SetupCarousel
          disabled={submitting}
          framed={false}
          items={ICONS}
          label={copy.icon}
          onChange={(icon) =>
            onLookChange({ ...look, icon: icon === INITIALS ? null : icon })
          }
          render={(icon) => (
            <span
              className={cn(
                "flex size-[88px] items-center justify-center rounded-[22px] text-white shadow-[0_14px_28px_-12px_oklch(0%_0_0/0.45)] transition-colors duration-300",
                icon === INITIALS
                  ? "font-heading font-semibold text-[32px] tracking-tight"
                  : "text-[44px]"
              )}
              style={{ backgroundColor: look.color }}
            >
              {icon === INITIALS ? initials : icon}
            </span>
          )}
          value={look.icon ?? INITIALS}
          valueText={(icon) => (icon === INITIALS ? copy.initials : icon)}
        />
        <div
          aria-label={copy.color}
          className="flex flex-wrap justify-center gap-2"
          role="radiogroup"
        >
          {SPACE_COLORS.map((color) => {
            const on = look.color === color;
            return (
              <button
                aria-checked={on}
                aria-label={color}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-white transition",
                  on
                    ? "scale-110 ring-2 ring-ink/80 ring-offset-2 ring-offset-paper"
                    : "hover:scale-110"
                )}
                disabled={submitting}
                key={color}
                onClick={() => onLookChange({ ...look, color })}
                role="radio"
                style={{ backgroundColor: color }}
                type="button"
              >
                {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <Input
          aria-label={copy.name}
          autoFocus
          className={cn(
            SETUP_INPUT_CLASS,
            "h-12 text-center font-heading font-semibold text-[19px] placeholder:font-normal placeholder:font-sans placeholder:text-[15px]"
          )}
          disabled={submitting}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={copy.namePlaceholder}
          value={name}
        />
        <p className="font-mono text-[12px] text-ink-3">
          /s/{spaceKeyFromName(name) || "…"}
        </p>
      </div>

      <SetupChoice
        disabled={submitting}
        label={copy.privacy}
        onChange={onVisibilityChange}
        options={[
          { icon: Users, value: "open", ...copy.visibility.open },
          { icon: Lock, value: "private", ...copy.visibility.private },
        ]}
        value={visibility}
      />

      <ErrorLine message={error} />
      <SubmitButton
        busy={submitting}
        busyLabel={copy.busy}
        label={copy.submit}
      />
    </form>
  );
}
