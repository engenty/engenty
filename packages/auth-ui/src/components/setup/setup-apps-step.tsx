// Apps – the space's first app: one of four cards, each with one line on what
// it is for; the picture shows it at work. The first is engenty Apps: the
// space's own apps and workflows, which engenties build when asked. A card is
// one app or a group (Commercial: offers, invoices, receipts); only the apps
// this installation has are mounted, and a card with none of them is not
// offered. What an app needs comes along quietly. Skippable: the space works
// with chat and files alone.

import { cn } from "@engenty/ui-core";
import {
  BookOpen,
  Contact,
  type LucideIcon,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import type { SetupCatalog } from "../../lib/initial-setup-workspace";
import type { SetupCopy } from "../../lib/setup-wizard-i18n";
import { ErrorLine, SubmitButton, TextLink } from "./setup-bits";

type Module = SetupCatalog["modules"][number];

export type AppCardId = keyof SetupCopy["apps"]["cards"];

/** The cards the wizard offers, in order, and the apps behind each. */
export const APP_CARDS: readonly {
  icon: LucideIcon;
  id: AppCardId;
  modules: readonly string[];
}[] = [
  { icon: Sparkles, id: "build", modules: ["engenty-apps"] },
  { icon: BookOpen, id: "knowledge", modules: ["knowledge-base"] },
  { icon: Contact, id: "contacts", modules: ["contacts"] },
  {
    icon: ReceiptText,
    id: "commercial",
    modules: ["offers", "invoices", "expenses"],
  },
];

/** The icon of the card an app belongs to, for the picture's sidebar. */
export function appIcon(moduleId: string): LucideIcon | null {
  return (
    APP_CARDS.find((card) => card.modules.includes(moduleId))?.icon ?? null
  );
}

/** The cards this installation can offer: those with an installed app behind them. */
export function offeredCards(catalog: SetupCatalog): typeof APP_CARDS {
  const installed = new Set(catalog.modules.map((m) => m.id));
  return APP_CARDS.filter((card) =>
    card.modules.some((id) => installed.has(id))
  );
}

/** The installed apps behind a card. */
export function cardModules(
  card: AppCardId | null,
  catalog: SetupCatalog
): string[] {
  const installed = new Set(catalog.modules.map((m) => m.id));
  return (APP_CARDS.find((c) => c.id === card)?.modules ?? []).filter((id) =>
    installed.has(id)
  );
}

/** Module ids a selection pulls in: each app plus what it requires. */
function withRequired(
  picked: ReadonlySet<string>,
  modules: readonly Module[]
): Set<string> {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const all = new Set<string>();
  const visit = (id: string) => {
    if (all.has(id) || !byId.has(id)) {
      return;
    }
    all.add(id);
    for (const dep of byId.get(id)?.requires ?? []) {
      visit(dep);
    }
  };
  for (const id of picked) {
    visit(id);
  }
  return all;
}

export function AppsStep({
  add,
  catalog,
  color,
  copy,
  onPickedChange,
  onSkip,
  picked,
}: {
  /** Adds the apps; rejects with the reason when it could not. */
  add: (modules: string[]) => Promise<void>;
  catalog: SetupCatalog;
  /** The space's colour, behind each card's glyph. */
  color: string;
  copy: SetupCopy["apps"];
  onPickedChange: (picked: AppCardId) => void;
  onSkip: () => Promise<void>;
  picked: AppCardId | null;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offered = offeredCards(catalog);
  const run = async (action: () => Promise<void>) => {
    setError(null);
    setSubmitting(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() =>
      add([
        ...withRequired(new Set(cardModules(picked, catalog)), catalog.modules),
      ])
    );
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      <div className="flex flex-col gap-2.5" role="radiogroup">
        {offered.map(({ icon: Icon, id }) => {
          const card = copy.cards[id];
          const on = picked === id;
          return (
            <button
              aria-checked={on}
              className={cn(
                "flex items-center gap-3.5 rounded-[14px] bg-card p-3.5 text-left ring-1 transition-[box-shadow,opacity]",
                on
                  ? "shadow-[0_10px_24px_-14px_oklch(0%_0_0/0.35)] ring-2 ring-primary"
                  : "ring-ink/10 hover:ring-ink/25"
              )}
              disabled={submitting}
              key={id}
              onClick={() => onPickedChange(id)}
              role="radio"
              type="button"
            >
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-[12px] text-white transition-colors duration-300"
                style={{ backgroundColor: color }}
              >
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium text-[15px] text-ink">
                  {card.label}
                </span>
                <span className="text-[13px] text-ink-3 leading-snug">
                  {card.hint}
                </span>
              </span>
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full transition-colors",
                  on ? "bg-primary" : "ring-1 ring-ink/20"
                )}
              >
                {on ? <span className="size-2 rounded-full bg-white" /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className="-mt-2 text-center text-[13px] text-ink-3">{copy.later}</p>

      <ErrorLine message={error} />
      <div className="flex flex-col gap-3">
        <SubmitButton
          busy={submitting}
          busyLabel={copy.busy}
          disabled={picked === null}
          label={copy.submit}
        />
        <TextLink
          className="self-center"
          disabled={submitting}
          onClick={() => run(onSkip)}
        >
          {copy.skip}
        </TextLink>
      </div>
    </form>
  );
}
