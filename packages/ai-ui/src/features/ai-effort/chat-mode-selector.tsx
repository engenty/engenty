"use client";

// The composer's model control: Normal or Extra for everyone — each naming
// the model it runs — and, when the platform offers them, a Custom flyout to
// pick one model and, where the model reasons, how long it thinks. Extra
// renders disabled rather than hidden on a plan without it, so the plan
// boundary is legible.

import {
  AI_REASONING_LEVELS,
  type AiReasoningEffort,
} from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@engenty/ui-core";
import { ChevronDown, Cpu, Gauge, Sparkles } from "lucide-react";
import type { SyntheticEvent } from "react";
import type {
  ComposerModeModel,
  CustomModelOption,
} from "../../lib/admin/gateway-model-options-api.js";
import { providerName } from "../ai-settings/model-catalog-display.js";
import type { ChatMode, ChatModePick } from "./chat-mode.js";

const MODE_ICON: Record<ChatMode, typeof Gauge> = {
  custom: Cpu,
  extra: Sparkles,
  normal: Gauge,
};

export interface ChatModeSelectorProps {
  customModels: readonly CustomModelOption[];
  /** Show raw model ids under the names — plumbing only developers want. */
  developerMode?: boolean;
  disabled?: boolean;
  extraAllowed: boolean;
  /** The model Extra runs; null while unknown or unbound. */
  extraModel?: ComposerModeModel | null;
  /** The model Normal runs; null while unknown or unbound. */
  normalModel?: ComposerModeModel | null;
  onChange: (pick: ChatModePick) => void;
  pick: ChatModePick;
}

function modelLabel(model: {
  display_name: string | null;
  model_id: string;
}): string {
  return model.display_name?.trim() || model.model_id;
}

/** "Claude Sonnet 5 · Expensive" — the model's name and what it costs. */
function modeModelLine(
  model: ComposerModeModel,
  t: (key: string) => string
): string {
  return [
    modelLabel(model),
    model.price_tier ? t(`fields.priceTier.${model.price_tier}`) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Anthropic · Expensive" — who makes it and what it costs, never the id. */
function modelMeta(
  model: CustomModelOption,
  t: (key: string) => string
): string {
  return [
    providerName(model.provider),
    model.price_tier ? t(`fields.priceTier.${model.price_tier}`) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The picked model's reasoning level, on the model's own row. Buttons, not
 * menu items: a click must set the level without re-selecting the row or
 * closing the flyout, so each one stops the event before the item sees it.
 */
function ReasoningLevels({
  onChange,
  t,
  value,
}: {
  onChange: (level: AiReasoningEffort | null) => void;
  t: (key: string) => string;
  value: AiReasoningEffort | null;
}) {
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  const levels = [null, ...AI_REASONING_LEVELS] as const;
  const activeIndex = Math.max(0, levels.indexOf(value));
  return (
    // `-mr-6` reaches under the item's check column, so the control spans
    // the whole row rather than stopping at the text column.
    <div
      aria-label={t("effort.reasoning.label")}
      className="relative mt-2 -mr-6 grid grid-cols-4 rounded-md bg-muted p-0.5"
      role="group"
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-[5px] bg-primary shadow-sm transition-transform duration-200 ease-out"
        style={{
          transform: `translateX(${activeIndex * 100}%)`,
          width: "calc((100% - 0.25rem) / 4)",
        }}
      />
      {levels.map((level, index) => {
        const active = index === activeIndex;
        return (
          <button
            aria-pressed={active}
            className={[
              "relative z-10 rounded-[5px] py-1 text-center text-[11px] leading-4 transition-colors duration-200",
              // `!`: the highlighted menu item recolours every descendant
              // (`focus:**:text-accent-foreground`), which would put dark
              // text on the marker while the row is hovered.
              active
                ? "font-medium text-primary-foreground!"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
            key={level ?? "default"}
            onClick={(event) => {
              stop(event);
              onChange(level);
            }}
            onKeyDown={stop}
            onPointerDown={stop}
            onPointerUp={stop}
            type="button"
          >
            {t(`effort.reasoning.${level ?? "default"}`)}
          </button>
        );
      })}
    </div>
  );
}

export function ChatModeSelector({
  customModels,
  developerMode,
  disabled,
  extraAllowed,
  extraModel,
  normalModel,
  onChange,
  pick,
}: ChatModeSelectorProps) {
  const { t } = useTranslation("ai-ui");
  const customModel =
    pick.mode === "custom"
      ? customModels.find((model) => model.ref === pick.customModel)
      : undefined;
  const ActiveIcon = MODE_ICON[pick.mode];
  const modeModels = { extra: extraModel ?? null, normal: normalModel ?? null };

  // "Claude Opus 5.5 · High": the level travels with the model it is set on.
  const customLabel = customModel
    ? [
        modelLabel(customModel),
        customModel.reasoning_effort && pick.customReasoning
          ? t(`effort.reasoning.${pick.customReasoning}`)
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const label = customModel ? customLabel : t(`effort.mode.${pick.mode}.label`);

  const selectModel = (ref: string) => {
    onChange({
      ...pick,
      customModel: ref,
      // A level belongs to the model it was set on.
      customReasoning: ref === pick.customModel ? pick.customReasoning : null,
      mode: "custom",
    });
  };
  const selectCustomReasoning = (value: AiReasoningEffort | null) => {
    onChange({ ...pick, customReasoning: value, mode: "custom" });
  };
  const selectExtraReasoning = (value: AiReasoningEffort | null) => {
    onChange({ ...pick, extraReasoning: value, mode: "extra" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("effort.ariaLabel")}
        className="flex h-6 max-w-[14rem] items-center gap-1 rounded-full border-0 bg-transparent px-2 text-muted-foreground text-xs shadow-none outline-none transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ActiveIcon aria-hidden className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown aria-hidden className="size-3 shrink-0 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuRadioGroup
          onValueChange={(next) =>
            onChange({ ...pick, mode: next as "extra" | "normal" })
          }
          value={pick.mode === "custom" ? "" : pick.mode}
        >
          {(["normal", "extra"] as const).map((mode) => {
            const allowed = mode === "normal" || extraAllowed;
            const model = modeModels[mode];
            return (
              <DropdownMenuRadioItem
                className="items-start py-2"
                disabled={!allowed}
                key={mode}
                value={mode}
              >
                <div className="min-w-0 flex-1">
                  <span className="block leading-tight">
                    {t(`effort.mode.${mode}.label`)}
                  </span>
                  {model ? (
                    <span className="mt-0.5 block truncate text-muted-foreground text-xs">
                      {modeModelLine(model, t)}
                    </span>
                  ) : null}
                  <p className="mt-0.5 text-muted-foreground text-xs leading-snug">
                    {allowed
                      ? t(`effort.mode.${mode}.desc`)
                      : t("effort.notInPlan")}
                  </p>
                  {developerMode && model ? (
                    <code className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">
                      {model.model_id}
                    </code>
                  ) : null}
                  {mode === "extra" &&
                  pick.mode === "extra" &&
                  model?.reasoning_effort ? (
                    <ReasoningLevels
                      onChange={selectExtraReasoning}
                      t={t}
                      value={pick.extraReasoning}
                    />
                  ) : null}
                </div>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        {customModels.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="py-2">
                <div className="min-w-0 flex-1">
                  <span className="block leading-tight">
                    {t("effort.mode.custom.label")}
                  </span>
                  <p className="mt-0.5 truncate text-muted-foreground text-xs leading-snug">
                    {customModel ? customLabel : t("effort.mode.custom.desc")}
                  </p>
                </div>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-96 w-72 overflow-y-auto">
                <DropdownMenuRadioGroup
                  onValueChange={(next) => selectModel(String(next))}
                  value={customModel?.ref ?? ""}
                >
                  {customModels.map((model) => {
                    const selected = model.ref === customModel?.ref;
                    return (
                      <DropdownMenuRadioItem
                        className="items-start py-1.5"
                        key={model.ref}
                        value={model.ref}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="block truncate leading-tight">
                            {modelLabel(model)}
                          </span>
                          <span className="block truncate text-muted-foreground text-xs">
                            {modelMeta(model, t)}
                          </span>
                          {developerMode ? (
                            <code className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
                              {model.model_id}
                            </code>
                          ) : null}
                          {selected && model.reasoning_effort ? (
                            <ReasoningLevels
                              onChange={selectCustomReasoning}
                              t={t}
                              value={pick.customReasoning}
                            />
                          ) : null}
                        </div>
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
