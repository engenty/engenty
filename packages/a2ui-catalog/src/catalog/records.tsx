"use client";

import { createComponentImplementation } from "@a2ui/react/v0_9";
import {
  ActionSchema,
  ChildListSchema,
  DynamicStringSchema,
} from "@a2ui/web_core/v0_9";
import { cn, Badge as UiBadge } from "@engenty/ui-core";
import { Fragment } from "react";
import { z } from "zod";
import { renderMarkdown } from "../markdown.js";
import {
  A2uiChildren,
  asText,
  resolveA2uiActionHandler,
  useEngentyA2uiHost,
} from "./host.js";

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

export const Row = createComponentImplementation(
  RowApi,
  ({ buildChild, context, props }) => {
    const host = useEngentyA2uiHost();
    const objectRef =
      typeof props.objectRef === "string" ? props.objectRef : undefined;
    if (objectRef && host.renderObjectRef) {
      // Bridge property: the native record row renders instead — live data,
      // viewer authz, panel/menu affordances from the tier-1 machinery.
      return <>{host.renderObjectRef(objectRef)}</>;
    }
    const action = resolveA2uiActionHandler(props.action, context);
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
        <A2uiChildren
          buildChild={buildChild}
          context={context}
          value={props.children}
        />
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
  }
);

export const DetailGrid = createComponentImplementation(
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

export const Badge = createComponentImplementation(
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

const TEXT_VARIANT_CLASSES: Record<string, string> = {
  h3: "px-2 pt-1 font-semibold text-base text-foreground",
  h4: "px-2 pt-1 font-medium text-foreground text-sm",
  body: "px-2 text-foreground/90 text-sm",
  muted: "px-2 text-muted-foreground text-xs",
};

export const Text = createComponentImplementation(
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

const CALLOUT_TONE_CLASSES: Record<string, string> = {
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200",
  success:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  warning:
    "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
};

export const Callout = createComponentImplementation(
  {
    name: "Callout",
    schema: z.object({
      text: DynamicStringSchema.optional(),
      tone: z.enum(["info", "success", "warning", "danger"]).optional(),
    }),
  },
  ({ props }) => (
    <div
      className={cn(
        "mx-2 my-1 rounded-md border px-3 py-2 text-sm",
        CALLOUT_TONE_CLASSES[
          typeof props.tone === "string" ? props.tone : "info"
        ] ?? CALLOUT_TONE_CLASSES.info
      )}
      role="note"
    >
      {asText(props.text)}
    </div>
  )
);

export const Markdown = createComponentImplementation(
  {
    name: "Markdown",
    schema: z.object({ text: DynamicStringSchema.optional() }),
  },
  ({ props }) => (
    <div className="flex flex-col gap-2 px-2 py-1">
      {renderMarkdown(asText(props.text))}
    </div>
  )
);

export const Image = createComponentImplementation(
  {
    name: "Image",
    schema: z.object({
      alt: z.string().optional(),
      height: z.number().optional(),
      url: DynamicStringSchema.optional(),
      width: z.number().optional(),
    }),
  },
  ({ props }) => {
    const url = asText(props.url);
    if (!url) {
      return null;
    }
    return (
      <img
        alt={asText(props.alt)}
        className="mx-2 my-1 h-auto max-w-full rounded-md"
        height={typeof props.height === "number" ? props.height : undefined}
        src={url}
        width={typeof props.width === "number" ? props.width : undefined}
      />
    );
  }
);
