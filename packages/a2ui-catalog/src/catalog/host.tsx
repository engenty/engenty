"use client";

import type { ComponentContext } from "@a2ui/web_core/v0_9";
import {
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Host services injected by the surface that mounts the renderer. Keeps this
 * package free of ai-ui dependencies: the chat card provides
 * `renderObjectRef` from the tier-1 object-widget machinery, bridging A2UI
 * composition with native live records (§5b `Row.objectRef`);
 * `renderObjectPicker` and `renderArtifact` are the same seam for the
 * `ObjectPicker` and `Document` components.
 */
export interface EngentyA2uiHost {
  renderArtifact?: (artifactId: string) => ReactNode;
  renderObjectPicker?: (props: {
    disabled?: boolean;
    entity: string;
    label?: string;
    onChange: (ref: string | null) => void;
    value: string | null;
  }) => ReactNode;
  renderObjectRef?: (ref: string) => ReactNode;
}

export const EngentyA2uiHostContext = createContext<EngentyA2uiHost>({});

export function EngentyA2uiHostProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: EngentyA2uiHost;
}) {
  return (
    <EngentyA2uiHostContext.Provider value={value}>
      {children}
    </EngentyA2uiHostContext.Provider>
  );
}

export function useEngentyA2uiHost(): EngentyA2uiHost {
  return useContext(EngentyA2uiHostContext);
}

type ChildRef = string | { basePath?: string; id: string };

/** A dynamic list: one copy of `componentId` per item of the array at `path`. */
interface ChildTemplate {
  componentId: string;
  path: string;
}

function childTemplate(value: unknown): ChildTemplate | null {
  if (Array.isArray(value) || !value || typeof value !== "object") {
    return null;
  }
  const raw = value as { componentId?: unknown; path?: unknown };
  return typeof raw.componentId === "string" && typeof raw.path === "string"
    ? { componentId: raw.componentId, path: raw.path }
    : null;
}

function lengthOf(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * A container's children: a static list of ids, or a template the binder
 * turned into one `{ id, basePath }` per array item.
 *
 * The template is also resolved here from the raw `{ componentId, path }`,
 * for the same reason `useBoundValue` writes through the data context: when
 * the binder does not recognise our schemas it hands every prop through
 * untouched, and an unresolved template would render nothing at all.
 */
export function A2uiChildren({
  buildChild,
  context,
  value,
}: {
  buildChild: (id: string, basePath?: string) => ReactNode;
  context: ComponentContext;
  value: unknown;
}): ReactNode {
  const template = childTemplate(value);
  const path = template?.path ?? null;
  const [rows, setRows] = useState<number>(() =>
    path === null
      ? 0
      : lengthOf(context.dataContext.resolveDynamicValue({ path } as never))
  );
  useEffect(() => {
    if (path === null) {
      return;
    }
    const subscription = context.dataContext.subscribeDynamicValue(
      { path } as never,
      (next) => setRows(lengthOf(next))
    );
    setRows(lengthOf(subscription.value));
    return () => subscription.unsubscribe();
  }, [context, path]);

  if (template) {
    const base = template.path.endsWith("/")
      ? template.path.slice(0, -1)
      : template.path;
    return (
      <>
        {Array.from({ length: rows }, (_unused, index) => (
          <Fragment key={`${template.componentId}-${index}`}>
            {buildChild(template.componentId, `${base}/${index}`)}
          </Fragment>
        ))}
      </>
    );
  }
  if (!Array.isArray(value)) {
    return null;
  }
  return (
    <>
      {(value as ChildRef[]).map((child, index) =>
        typeof child === "string" ? (
          <Fragment key={`${child}-${index}`}>{buildChild(child)}</Fragment>
        ) : (
          <Fragment key={`${child.id}-${child.basePath ?? index}`}>
            {buildChild(child.id, child.basePath)}
          </Fragment>
        )
      )}
    </>
  );
}

/**
 * A prop the binder left as a raw `{ path }` binding, read from the data
 * context instead — the counterpart of `useBoundValue` for props a component
 * only reads (see the note there on why a binding can arrive unresolved).
 */
export function useResolvedProp(
  context: ComponentContext,
  name: string,
  resolved: unknown
): unknown {
  const raw = (
    context.componentModel.properties as Record<string, unknown> | undefined
  )?.[name];
  const path =
    resolved === raw &&
    raw &&
    typeof raw === "object" &&
    typeof (raw as { path?: unknown }).path === "string"
      ? (raw as { path: string }).path
      : null;
  const [value, setValue] = useState<unknown>(() =>
    path === null
      ? undefined
      : context.dataContext.resolveDynamicValue({ path } as never)
  );
  useEffect(() => {
    if (path === null) {
      return;
    }
    const subscription = context.dataContext.subscribeDynamicValue(
      { path } as never,
      (next) => setValue(next)
    );
    setValue(subscription.value);
    return () => subscription.unsubscribe();
  }, [context, path]);
  return path === null ? resolved : value;
}

export function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

/**
 * Resolve an `action` prop into a click handler.
 *
 * When the binder resolves the field (zod-3 schema introspection) it hands us
 * a ready `() => void` closure. But the A2UI binder reads zod internals by
 * major version, and this monorepo pins the app to zod 4 while the a2ui stack
 * needs zod 3 — a mismatch the bundler can reintroduce (see the zod overrides
 * + binder-contract test). To stay correct regardless, fall back to
 * dispatching the raw `{ event: { name, context } }` payload through the
 * component context ourselves — the same channel the resolved closure uses.
 */
export function resolveA2uiActionHandler(
  action: unknown,
  context: ComponentContext
): (() => void) | undefined {
  if (typeof action === "function") {
    return action as () => void;
  }
  if (
    action &&
    typeof action === "object" &&
    "event" in action &&
    (action as { event?: unknown }).event
  ) {
    // `dispatchAction` expects the whole `{ event: { name, context } }`
    // payload (it reads `payload.event`), not the unwrapped event.
    return () => {
      void context.dispatchAction(action);
    };
  }
  return;
}

/** Same as {@link resolveA2uiActionHandler}, with extra event context merged in. */
export function dispatchA2uiAction(
  action: unknown,
  context: ComponentContext,
  extra?: Record<string, unknown>
): void {
  if (typeof action === "function") {
    (action as () => void)();
    return;
  }
  if (
    !(
      action &&
      typeof action === "object" &&
      "event" in action &&
      (action as { event?: unknown }).event
    )
  ) {
    return;
  }
  const event = (action as { event: Record<string, unknown> }).event;
  const base =
    event.context && typeof event.context === "object"
      ? (event.context as Record<string, unknown>)
      : {};
  void context.dispatchAction({
    event: {
      ...event,
      context: extra ? { ...base, ...extra } : event.context,
    },
  });
}
