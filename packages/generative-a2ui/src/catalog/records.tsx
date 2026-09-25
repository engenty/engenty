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
  useResolvedProp,
} from "./host.js";

const RowApi = {
  name: "Row",
  schema: z.object({
    action: ActionSchema.optional(),
    badge: DynamicStringSchema.optional(),
    children: ChildListSchema.optional(),
    meta: DynamicStringSchema.optional(),
    objectRef: DynamicStringSchema.optional(),
    subtitle: DynamicStringSchema.optional(),
    title: DynamicStringSchema.optional(),
    wrap: z.boolean().optional(),
  }),
};

export const Row = createComponentImplementation(
  RowApi,
  ({ buildChild, context, props }) => {
    const host = useEngentyA2uiHost();
    // A ref bound to the page's data — the record an earlier step wrote.
    const objectRef =
      asText(useResolvedProp(context, "objectRef", props.objectRef)) ||
      undefined;
    if (objectRef && host.renderObjectRef) {
      // Bridge property: the native record row renders instead — live data,
      // viewer authz, panel/menu affordances from the tier-1 machinery.
      return <>{host.renderObjectRef(objectRef)}</>;
    }
    const action = resolveA2uiActionHandler(props.action, context);
    // A record row stays one line; a finding or a section wraps in full.
    const fit = props.wrap === true ? "text-pretty" : "truncate";
    const body = (
      <>
        <div className="min-w-0 flex-1">
          <div className={cn(fit, "text-foreground text-sm")}>
            {asText(props.title)}
          </div>
          {asText(props.subtitle) ? (
            <div className={cn(fit, "text-muted-foreground text-xs")}>
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
      // Label above value on a narrow surface; side by side, with the label
      // column capped, once there is room.
      <dl className="mx-2 my-1 grid @sm/surface:grid-cols-[minmax(0,35%)_1fr] grid-cols-1 gap-x-4 @sm/surface:gap-y-1.5 rounded-md bg-muted/60 px-3 py-2.5">
        {rows.map(
          (row: { label?: unknown; value?: unknown }, index: number) => (
            <Fragment key={`${asText(row.label)}-${index}`}>
              <dt className="@sm/surface:pt-0 pt-1.5 text-muted-foreground text-xs leading-5 first:pt-0">
                {asText(row.label)}
              </dt>
              <dd className="min-w-0 text-pretty break-words text-foreground/90 text-sm">
                {asText(row.value)}
              </dd>
            </Fragment>
          )
        )}
      </dl>
    );
  }
);

/** Status tones from the design tokens (light + dark come with them). */
const TONE_CLASSES: Record<string, string> = {
  info: "border-transparent bg-(--info-tint) text-foreground",
  success: "border-transparent bg-(--success-tint) text-foreground",
  warning: "border-transparent bg-(--warning-tint) text-foreground",
};

export const Badge = createComponentImplementation(
  {
    name: "Badge",
    schema: z.object({
      label: DynamicStringSchema.optional(),
      tone: z.enum(["default", "info", "success", "warning"]).optional(),
    }),
  },
  ({ props }) => (
    <UiBadge
      className={cn(
        "w-fit text-[10px]",
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
  // Text bound to the page's data (`{ path }`) can arrive unresolved; read
  // it off the data model then, the same as Table's rows.
  ({ context, props }) => {
    const text = useResolvedProp(context, "text", props.text);
    return (
      <p
        className={
          TEXT_VARIANT_CLASSES[
            typeof props.variant === "string" ? props.variant : "body"
          ] ?? TEXT_VARIANT_CLASSES.body
        }
      >
        {asText(text)}
      </p>
    );
  }
);

const CALLOUT_TONE_CLASSES: Record<string, string> = {
  danger: "border-(--danger) bg-(--danger-tint)",
  info: "border-(--info) bg-(--info-tint)",
  success: "border-(--success) bg-(--success-tint)",
  warning: "border-(--warning) bg-(--warning-tint)",
};

export const Callout = createComponentImplementation(
  {
    name: "Callout",
    schema: z.object({
      text: DynamicStringSchema.optional(),
      tone: z.enum(["info", "success", "warning", "danger"]).optional(),
    }),
  },
  ({ context, props }) => {
    const text = asText(useResolvedProp(context, "text", props.text));
    // Nothing to say is no box: an empty bound note drew a bare stripe.
    if (!text) {
      return null;
    }
    return (
      <div
        className={cn(
          "mx-2 my-1 rounded-r-md border-l-[3px] px-3 py-2 text-foreground text-sm",
          CALLOUT_TONE_CLASSES[
            typeof props.tone === "string" ? props.tone : "info"
          ] ?? CALLOUT_TONE_CLASSES.info
        )}
        role="note"
      >
        {text}
      </div>
    );
  }
);

export const Markdown = createComponentImplementation(
  {
    name: "Markdown",
    schema: z.object({ text: DynamicStringSchema.optional() }),
  },
  ({ context, props }) => {
    const text = useResolvedProp(context, "text", props.text);
    return (
      <div className="flex flex-col gap-2 px-2 py-1">
        {renderMarkdown(asText(text))}
      </div>
    );
  }
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
