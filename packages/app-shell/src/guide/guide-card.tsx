"use client";

import { Button, cn, Input, Textarea } from "@engenty/ui-core";
import {
  autoPlacement,
  autoUpdate,
  computePosition,
  flip,
  type Middleware,
  offset,
  shift,
} from "@floating-ui/dom";
import {
  type ChangeEvent,
  type CSSProperties,
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import type { TargetRect } from "./guide-chrome.js";
import {
  UI_GUIDE_SPOTLIGHT_PADDING_PX,
  type UiGuideActionVariant,
  type UiGuideInputConfig,
  type UiGuideInputField,
  type UiGuidePlacement,
  type UiGuideSession,
} from "./types.js";

export type GuideActionHandler = (
  workflowId: string,
  inputValue?: string,
  inputValues?: Record<string, string>
) => void;

function buttonVariantFor(
  variant: UiGuideActionVariant | undefined
): "default" | "secondary" | "ghost" {
  if (variant === "secondary") {
    return "secondary";
  }
  if (variant === "ghost") {
    return "ghost";
  }
  return "default";
}

/**
 * "auto" takes the side with the most room. It used to mean "bottom": a
 * full-height target (the sidebar) left no room below or above, flip had
 * nowhere to go, and the card sat under the viewport — only the dimming
 * showed. An explicit side still flips, to any side, when it does not fit.
 */
function placementMiddleware(placement: UiGuidePlacement): Middleware {
  return placement === "auto"
    ? autoPlacement({ padding: 12 })
    : flip({ fallbackAxisSideDirection: "end", padding: 12 });
}

function resolveInputFields(session: UiGuideSession): UiGuideInputField[] {
  if (session.inputs?.length) {
    return session.inputs;
  }
  if (session.input) {
    const single: UiGuideInputConfig = session.input;
    return [
      {
        id: "value",
        ...(single.default_value === undefined
          ? {}
          : { default_value: single.default_value }),
        ...(single.label === undefined ? {} : { label: single.label }),
        ...(single.placeholder === undefined
          ? {}
          : { placeholder: single.placeholder }),
        ...(single.required === undefined ? {} : { required: single.required }),
        ...(single.type === undefined ? {} : { type: single.type }),
      },
    ];
  }
  return [];
}

function submitActionIdFor(session: UiGuideSession): string {
  if (session.inputs?.length) {
    return (
      session.actions.find((a) => a.variant === "primary")?.id ??
      session.actions[0]?.id ??
      "ok"
    );
  }
  return session.input?.submit_action_id ?? "ok";
}

/**
 * What the host app supplies: app-shell has neither translations nor a
 * Markdown renderer, and the model writes guide bodies in Markdown.
 */
export interface GuideCardText {
  dismissLabel: string;
  renderBody: (body: string) => ReactNode;
}

const PLAIN_BODY_CLASS =
  "whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed";

export const GuideCardTextContext = createContext<GuideCardText>({
  dismissLabel: "Dismiss",
  renderBody: (body) => <p className={PLAIN_BODY_CLASS}>{body}</p>,
});

function GuideCardChrome({
  children,
  className,
  onAction,
  onDismiss,
  session,
  style,
  cardRef,
}: {
  cardRef?: (el: HTMLDivElement | null) => void;
  children?: ReactNode;
  className?: string;
  onAction: GuideActionHandler;
  onDismiss: () => void;
  session: UiGuideSession;
  style?: CSSProperties;
}) {
  const text = useContext(GuideCardTextContext);
  const fields = resolveInputFields(session);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.id] = field.default_value ?? "";
    }
    return initial;
  });

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const field of resolveInputFields(session)) {
      next[field.id] = field.default_value ?? "";
    }
    setValues(next);
  }, [session.guide_id, session.input, session.inputs]);

  const submitActionId = submitActionIdFor(session);
  const singleFieldId = fields.length === 1 ? fields[0]?.id : null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    for (const field of fields) {
      if (field.required && !(values[field.id] ?? "").trim()) {
        return;
      }
    }
    if (session.inputs?.length) {
      onAction(submitActionId, undefined, { ...values });
      return;
    }
    onAction(
      submitActionId,
      singleFieldId == null ? undefined : (values[singleFieldId] ?? "")
    );
  };

  return (
    <div
      aria-describedby={session.body ? "ui-guide-body" : undefined}
      aria-labelledby="ui-guide-title"
      className={cn(
        "ui-canvas-floating flex w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-lg",
        className
      )}
      ref={cardRef}
      role="dialog"
      style={style}
    >
      <div className="space-y-2 px-4 pt-4 pb-3">
        <h2 className="font-semibold text-sm leading-snug" id="ui-guide-title">
          {session.title}
        </h2>
        {session.body ? (
          <div id="ui-guide-body">{text.renderBody(session.body)}</div>
        ) : null}
        {children}
      </div>
      <form
        className="flex flex-col gap-2 border-t px-4 py-3"
        onSubmit={handleSubmit}
      >
        {fields.map((field) => {
          const controlId = `ui-guide-input-${field.id}`;
          const shared = {
            id: controlId,
            onChange: (
              event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
            ) =>
              setValues((prev) => ({
                ...prev,
                [field.id]: event.target.value,
              })),
            placeholder: field.placeholder,
            required: field.required,
            value: values[field.id] ?? "",
          };
          return (
            <div className="flex flex-col gap-1" key={field.id}>
              {field.label ? (
                <label
                  className="font-medium text-muted-foreground text-xs"
                  htmlFor={controlId}
                >
                  {field.label}
                  {field.required ? " *" : ""}
                </label>
              ) : null}
              {field.type === "textarea" ? (
                <Textarea autoFocus={fields[0]?.id === field.id} {...shared} />
              ) : (
                <Input autoFocus={fields[0]?.id === field.id} {...shared} />
              )}
            </div>
          );
        })}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {session.show_dismiss ? (
            <Button onClick={onDismiss} size="sm" type="button" variant="ghost">
              {text.dismissLabel}
            </Button>
          ) : null}
          {session.actions.map((action) => (
            <Button
              key={action.id}
              onClick={(event) => {
                if (fields.length > 0 && action.id === submitActionId) {
                  return;
                }
                event.preventDefault();
                if (session.inputs?.length) {
                  onAction(action.id, undefined, { ...values });
                  return;
                }
                onAction(
                  action.id,
                  singleFieldId == null ? undefined : values[singleFieldId]
                );
              }}
              size="sm"
              type={
                fields.length > 0 && action.id === submitActionId
                  ? "submit"
                  : "button"
              }
              variant={buttonVariantFor(action.variant)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </form>
    </div>
  );
}

export function AnchoredGuidePopout({
  onAction,
  onDismiss,
  session,
  targetRect,
}: {
  onAction: GuideActionHandler;
  onDismiss: () => void;
  session: UiGuideSession;
  targetRect: TargetRect;
}) {
  const [popoutEl, setPopoutEl] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!popoutEl) {
      return;
    }
    const virtualRef = {
      getBoundingClientRect: () =>
        new DOMRect(
          targetRect.x - UI_GUIDE_SPOTLIGHT_PADDING_PX,
          targetRect.y - UI_GUIDE_SPOTLIGHT_PADDING_PX,
          targetRect.width + UI_GUIDE_SPOTLIGHT_PADDING_PX * 2,
          targetRect.height + UI_GUIDE_SPOTLIGHT_PADDING_PX * 2
        ),
    };
    const run = () => {
      void computePosition(virtualRef, popoutEl, {
        middleware: [
          offset(12),
          placementMiddleware(session.placement),
          // Both axes: a card taller than the room beside its target still
          // stays on screen.
          shift({ crossAxis: true, padding: 12 }),
        ],
        ...(session.placement === "auto"
          ? {}
          : { placement: session.placement }),
      }).then(({ strategy, x, y }) => {
        Object.assign(popoutEl.style, {
          left: `${x}px`,
          position: strategy,
          top: `${y}px`,
          visibility: "visible",
        });
      });
    };
    run();
    return autoUpdate(virtualRef, popoutEl, run, { animationFrame: true });
  }, [popoutEl, session.placement, targetRect]);

  return (
    <GuideCardChrome
      cardRef={setPopoutEl}
      className="fixed z-[190]"
      onAction={onAction}
      onDismiss={onDismiss}
      session={session}
      style={{ left: 0, top: 0, visibility: "hidden" }}
    />
  );
}

export function ModalGuideCard({
  onAction,
  onDismiss,
  session,
}: {
  onAction: GuideActionHandler;
  onDismiss: () => void;
  session: UiGuideSession;
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[190] flex items-center justify-center p-4">
      <div className="pointer-events-auto">
        <GuideCardChrome
          className="relative"
          onAction={onAction}
          onDismiss={onDismiss}
          session={session}
        />
      </div>
    </div>
  );
}
