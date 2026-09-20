"use client";

// The host every A2UI surface in ai-ui renders through.
//
// A surface is plain JSON; what it cannot describe are the seams that need
// this package: a record card drawn from the object-widget registry, an
// object picker searching the workspace, and an artifact body drawn by the
// artifact renderers. One boundary assembles those so the chat card and the
// gate card render a `Row.objectRef`, an `ObjectPicker` or a `Document` the
// same way.

import {
  type EngentyA2uiHost,
  EngentyA2uiHostProvider,
} from "@engenty/a2ui-catalog";
import { type ObjectRef, parseObjectRef } from "@engenty/ai-core/browser";
import { useTranslation } from "@engenty/i18n/ui";
import { Button, cn, Input } from "@engenty/ui-core";
import { Loader2, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { resolveArtifactRenderer } from "../artifacts/artifact-renderers.js";
import { useArtifactDetailQuery } from "../artifacts/artifacts-api.js";
import type {
  MentionRefCandidate,
  MentionRefSearch,
} from "../components/copilot/composer/use-copilot-composer-mention.js";
import { useObjectDisplayIntent } from "../objects/object-display-intent.js";
import { ObjectFallbackCard } from "../objects/object-fallback-card.js";
import { useObjectWidgets } from "../objects/object-widget-registry.js";

/** `ObjectPicker` seam: the catalog hands the host the field, the host draws it. */
export interface EngentyA2uiObjectPickerProps {
  disabled?: boolean;
  /** Entity key the field accepts, e.g. `contacts:contact`. */
  entity: string;
  label?: string;
  onChange: (value: string | null) => void;
  /** Canonical ObjectRef string, or null when empty. */
  value: string | null;
}

/** The host contract as ai-ui fills it — a superset of the catalog's seams. */
export type EngentyA2uiHostValue = EngentyA2uiHost & {
  renderArtifact?: (artifactId: string) => ReactNode;
  renderObjectPicker?: (props: EngentyA2uiObjectPickerProps) => ReactNode;
};

/** `Row.objectRef` bridge — the native record card, live data + viewer authz. */
function A2uiObjectRefRow({ refString }: { refString: string }) {
  const objectRef = useMemo(() => parseObjectRef(refString), [refString]);
  const widgets = useObjectWidgets();
  const { openInPanel } = useObjectDisplayIntent();
  if (!objectRef) {
    return null;
  }
  const widget =
    widgets.find(
      (reg) =>
        reg.module === objectRef.module && reg.entity === objectRef.entity
    ) ?? null;
  if (!widget) {
    return <ObjectFallbackCard items={[]} refs={[objectRef]} />;
  }
  const Card = widget.card;
  return (
    <Card
      onOpenInPanel={
        openInPanel ? (ref: ObjectRef) => openInPanel(ref) : undefined
      }
      refs={[objectRef]}
    />
  );
}

/** `Document` bridge — the artifact body through the registered renderer. */
function A2uiArtifactBody({ artifactId }: { artifactId: string }) {
  const { t } = useTranslation("ai-ui");
  const detail = useArtifactDetailQuery(artifactId);
  if (detail.isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-muted-foreground text-xs">
        <Loader2 aria-hidden className="size-3.5 animate-spin" />
        {t("a2uiHost.artifactLoading")}
      </div>
    );
  }
  const artifact = detail.data?.artifact;
  if (!artifact) {
    return (
      <p className="px-2 py-3 text-muted-foreground text-xs">
        {t("a2uiHost.artifactUnavailable")}
      </p>
    );
  }
  const Renderer = resolveArtifactRenderer(artifact.type);
  const content = detail.data?.version.content ?? null;
  if (!Renderer) {
    return (
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap px-2 py-2 text-xs">
        {content ?? ""}
      </pre>
    );
  }
  return (
    <div className="max-h-[32rem] overflow-auto rounded-md border bg-background">
      <Renderer artifact={artifact} content={content} />
    </div>
  );
}

const SEARCH_DEBOUNCE_MS = 200;

/**
 * Search-as-you-type picker over the same source the composer's `@` menu
 * uses. Without a search the field takes the canonical ref as text — the
 * value still lands in the data model, only the lookup is missing.
 */
function A2uiObjectPickerField(
  props: EngentyA2uiObjectPickerProps & { search: MentionRefSearch | null }
) {
  const { t } = useTranslation("ai-ui");
  const { disabled, entity, label, onChange, search, value } = props;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<MentionRefCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const inputId = useId();

  useEffect(() => {
    if (!(search && open)) {
      return;
    }
    const trimmed = query.trim();
    const seq = ++requestSeq.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void search(trimmed)
        .then((rows) => {
          if (seq !== requestSeq.current) {
            return;
          }
          setCandidates(rows.filter((row) => row.entity === entity));
        })
        .catch(() => {
          if (seq === requestSeq.current) {
            setCandidates([]);
          }
        })
        .finally(() => {
          if (seq === requestSeq.current) {
            setSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [entity, open, query, search]);

  const pick = useCallback(
    (candidate: MentionRefCandidate) => {
      setPickedLabel(candidate.label);
      setQuery("");
      setOpen(false);
      onChange(candidate.ref);
    },
    [onChange]
  );

  const clear = useCallback(() => {
    setPickedLabel(null);
    setQuery("");
    onChange(null);
  }, [onChange]);

  const displayLabel = value
    ? (pickedLabel ?? value.split(":").at(-1) ?? value)
    : null;

  if (!search) {
    return (
      <div className="flex flex-col gap-1 text-xs">
        {label ? (
          <label className="font-medium" htmlFor={inputId}>
            {label}
          </label>
        ) : null}
        <Input
          disabled={disabled}
          id={inputId}
          onChange={(event) => onChange(event.target.value.trim() || null)}
          placeholder={entity}
          value={value ?? ""}
        />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-1 text-xs">
      {label ? <span className="font-medium">{label}</span> : null}
      {value ? (
        <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate">{displayLabel}</span>
          <Button
            aria-label={t("a2uiHost.objectPicker.clear")}
            className="size-6 p-0"
            disabled={disabled}
            onClick={clear}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden className="size-3.5" />
          </Button>
        </div>
      ) : (
        <Input
          disabled={disabled}
          onBlur={() => {
            // Let a click on a row land before the list goes away.
            setTimeout(() => setOpen(false), 150);
          }}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={t("a2uiHost.objectPicker.placeholder")}
          value={query}
        />
      )}
      {open && !value ? (
        <ul
          className={cn(
            "absolute top-full left-0 z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
          )}
        >
          {searching && candidates.length === 0 ? (
            <li className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground">
              <Loader2 aria-hidden className="size-3.5 animate-spin" />
              {t("a2uiHost.objectPicker.searching")}
            </li>
          ) : null}
          {!searching && candidates.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground">
              {t("a2uiHost.objectPicker.empty")}
            </li>
          ) : null}
          {candidates.map((candidate) => (
            <li key={candidate.ref}>
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                onClick={() => pick(candidate)}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                {candidate.icon ? (
                  <candidate.icon className="size-3.5 shrink-0 text-muted-foreground" />
                ) : null}
                <span className="min-w-0 flex-1 truncate">
                  {candidate.label}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {candidate.group}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export interface UseEngentyA2uiHostOptions {
  /** Workspace search behind `ObjectPicker`; without it the field is text. */
  objectSearch?: MentionRefSearch | null;
}

/** The host value with every ai-ui seam filled in. */
export function useEngentyA2uiHost(
  options?: UseEngentyA2uiHostOptions
): EngentyA2uiHostValue {
  const objectSearch = options?.objectSearch ?? null;
  return useMemo<EngentyA2uiHostValue>(
    () => ({
      renderArtifact: (artifactId) => (
        <A2uiArtifactBody artifactId={artifactId} />
      ),
      renderObjectPicker: (props) => (
        <A2uiObjectPickerField {...props} search={objectSearch} />
      ),
      renderObjectRef: (ref) => <A2uiObjectRefRow refString={ref} />,
    }),
    [objectSearch]
  );
}

/** Provider form of {@link useEngentyA2uiHost} for surfaces rendered as children. */
export function EngentyA2uiHostBoundary({
  children,
  objectSearch,
}: UseEngentyA2uiHostOptions & { children: ReactNode }) {
  const host = useEngentyA2uiHost({ objectSearch });
  return (
    <EngentyA2uiHostProvider value={host}>{children}</EngentyA2uiHostProvider>
  );
}
