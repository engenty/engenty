"use client";

import {
  createComponentImplementation,
  type ReactComponentImplementation,
} from "@a2ui/react/v0_9";
import {
  ActionSchema,
  Catalog,
  ChildListSchema,
  DynamicStringSchema,
} from "@a2ui/web_core/v0_9";
import { cn, Badge as UiBadge, Button as UiButton } from "@engenty/ui-core";
import { createContext, Fragment, type ReactNode, useContext } from "react";
// NOTE: this package's `zod` is v3 — the version @a2ui/web_core schemas are
// built with. Do not import workspace-level zod4 helpers here.
import { z } from "zod";
import { ENGENTY_A2UI_CATALOG_ID } from "./spec.js";

/**
 * The engenty A2UI catalog, client side (docs/wip/generative-ui.md §5/§5b):
 * chrome-less components mapped onto ui-core primitives, rendered natively by
 * `@a2ui/react` — theme, query cache, and router for free, no sandbox needed
 * (UI-as-data: the agent can only reference these components).
 */

/**
 * Host services injected by the surface that mounts the renderer. Keeps this
 * package free of ai-ui dependencies: the chat card provides
 * `renderObjectRef` from the tier-1 object-widget machinery, bridging A2UI
 * composition with native live records (§5b `Row.objectRef`).
 */
export interface EngentyA2uiHost {
  renderObjectRef?: (ref: string) => ReactNode;
}

const EngentyA2uiHostContext = createContext<EngentyA2uiHost>({});

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

type ChildRef = string | { basePath?: string; id: string };

/** Inline equivalent of the renderer's non-exported ChildList helper. */
function renderChildren(
  children: unknown,
  buildChild: (id: string, basePath?: string) => ReactNode
): ReactNode {
  if (!Array.isArray(children)) {
    return null;
  }
  return (
    <>
      {(children as ChildRef[]).map((child, index) =>
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

function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

const List = createComponentImplementation(
  {
    name: "List",
    schema: z.object({ children: ChildListSchema.optional() }),
  },
  ({ buildChild, props }) => (
    <div className="flex flex-col">
      {renderChildren(props.children, buildChild)}
    </div>
  )
);

const RowApi = {
  name: "Row",
  schema: z.object({
    action: ActionSchema.optional(),
    badge: DynamicStringSchema.optional(),
    children: ChildListSchema.optional(),
    meta: DynamicStringSchema.optional(),
    objectRef: z.string().optional(),
    subtitle: DynamicStringSchema.optional(),
    title: DynamicStringSchema.optional(),
  }),
};

const Row = createComponentImplementation(RowApi, ({ buildChild, props }) => {
  const host = useContext(EngentyA2uiHostContext);
  const objectRef =
    typeof props.objectRef === "string" ? props.objectRef : undefined;
  if (objectRef && host.renderObjectRef) {
    // Bridge property: the native record row renders instead — live data,
    // viewer authz, panel/menu affordances from the tier-1 machinery.
    return <>{host.renderObjectRef(objectRef)}</>;
  }
  const action =
    typeof props.action === "function"
      ? (props.action as () => void)
      : undefined;
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-foreground text-sm">
          {asText(props.title)}
        </div>
        {asText(props.subtitle) ? (
          <div className="truncate text-muted-foreground text-xs">
            {asText(props.subtitle)}
          </div>
        ) : null}
      </div>
      {asText(props.meta) ? (
        <span className="shrink-0 text-muted-foreground text-xs">
          {asText(props.meta)}
        </span>
      ) : null}
      {asText(props.badge) ? (
        <UiBadge className="shrink-0 text-[10px]" variant="secondary">
          {asText(props.badge)}
        </UiBadge>
      ) : null}
      {renderChildren(props.children, buildChild)}
    </>
  );
  if (action) {
    return (
      <button
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50"
        onClick={action}
        type="button"
      >
        {body}
      </button>
    );
  }
  return <div className="flex items-center gap-2.5 px-2 py-2">{body}</div>;
});

const DetailGrid = createComponentImplementation(
  {
    name: "DetailGrid",
    schema: z.object({
      rows: z
        .array(
          z.object({
            label: DynamicStringSchema,
            value: DynamicStringSchema,
          })
        )
        .optional(),
    }),
  },
  ({ props }) => {
    const rows = Array.isArray(props.rows) ? props.rows : [];
    if (rows.length === 0) {
      return null;
    }
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-2 py-1.5">
        {rows.map(
          (row: { label?: unknown; value?: unknown }, index: number) => (
            <Fragment key={`${asText(row.label)}-${index}`}>
              <dt className="text-muted-foreground text-xs leading-5">
                {asText(row.label)}
              </dt>
              <dd className="min-w-0 truncate text-foreground/90 text-sm">
                {asText(row.value)}
              </dd>
            </Fragment>
          )
        )}
      </dl>
    );
  }
);

const TONE_CLASSES: Record<string, string> = {
  success:
    "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warning:
    "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

const Badge = createComponentImplementation(
  {
    name: "Badge",
    schema: z.object({
      label: DynamicStringSchema.optional(),
      tone: z.enum(["default", "success", "warning"]).optional(),
    }),
  },
  ({ props }) => (
    <UiBadge
      className={cn(
        "text-[10px]",
        typeof props.tone === "string" ? TONE_CLASSES[props.tone] : undefined
      )}
      variant="secondary"
    >
      {asText(props.label)}
    </UiBadge>
  )
);

const Actions = createComponentImplementation(
  {
    name: "Actions",
    schema: z.object({ children: ChildListSchema.optional() }),
  },
  ({ buildChild, props }) => (
    <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
      {renderChildren(props.children, buildChild)}
    </div>
  )
);

const Button = createComponentImplementation(
  {
    name: "Button",
    schema: z.object({
      action: ActionSchema.optional(),
      label: DynamicStringSchema.optional(),
    }),
  },
  ({ props }) => (
    <UiButton
      className="h-7 rounded-full px-2.5 text-xs"
      onClick={
        typeof props.action === "function"
          ? (props.action as () => void)
          : undefined
      }
      size="sm"
      variant="outline"
    >
      {asText(props.label)}
    </UiButton>
  )
);

const TEXT_VARIANT_CLASSES: Record<string, string> = {
  h3: "px-2 pt-1 font-semibold text-base text-foreground",
  h4: "px-2 pt-1 font-medium text-foreground text-sm",
  body: "px-2 text-foreground/90 text-sm",
  muted: "px-2 text-muted-foreground text-xs",
};

const Text = createComponentImplementation(
  {
    name: "Text",
    schema: z.object({
      text: DynamicStringSchema.optional(),
      variant: z.enum(["h3", "h4", "body", "muted"]).optional(),
    }),
  },
  ({ props }) => (
    <p
      className={
        TEXT_VARIANT_CLASSES[
          typeof props.variant === "string" ? props.variant : "body"
        ] ?? TEXT_VARIANT_CLASSES.body
      }
    >
      {asText(props.text)}
    </p>
  )
);

export function createEngentyA2uiCatalog(): Catalog<ReactComponentImplementation> {
  return new Catalog(ENGENTY_A2UI_CATALOG_ID, [
    List,
    Row,
    DetailGrid,
    Badge,
    Actions,
    Button,
    Text,
  ]);
}
