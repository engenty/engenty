"use client";

import { createComponentImplementation } from "@a2ui/react/v0_9";
import {
  ActionSchema,
  ChildListSchema,
  DynamicStringSchema,
} from "@a2ui/web_core/v0_9";
import {
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Separator,
  Button as UiButton,
  Card as UiCard,
} from "@engenty/ui-core";
import { z } from "zod";
import { A2uiChildren, asText, resolveA2uiActionHandler } from "./host.js";

const GAP_CLASSES: Record<string, string> = {
  lg: "gap-4",
  md: "gap-2",
  sm: "gap-1",
};

export const List = createComponentImplementation(
  {
    name: "List",
    schema: z.object({ children: ChildListSchema.optional() }),
  },
  ({ buildChild, context, props }) => (
    <div className="flex flex-col">
      <A2uiChildren
        buildChild={buildChild}
        context={context}
        value={props.children}
      />
    </div>
  )
);

export const Actions = createComponentImplementation(
  {
    name: "Actions",
    schema: z.object({ children: ChildListSchema.optional() }),
  },
  ({ buildChild, context, props }) => (
    // The attribute lets a host style the row — its first button is the
    // step's primary action (approve, continue), by the gates' convention.
    <div
      className="flex flex-wrap items-center gap-1.5 px-2 py-1.5"
      data-a2ui-actions=""
    >
      <A2uiChildren
        buildChild={buildChild}
        context={context}
        value={props.children}
      />
    </div>
  )
);

export const Button = createComponentImplementation(
  {
    name: "Button",
    schema: z.object({
      action: ActionSchema.optional(),
      label: DynamicStringSchema.optional(),
    }),
  },
  ({ context, props }) => (
    // Explicit `type="button"`: inside a Form the button's own action is the
    // only thing it dispatches; Enter / the Form's submit action is the form's.
    <UiButton
      className="h-7 rounded-full px-2.5 text-xs"
      onClick={resolveA2uiActionHandler(props.action, context)}
      size="sm"
      type="button"
      variant="outline"
    >
      {asText(props.label)}
    </UiButton>
  )
);

export const Column = createComponentImplementation(
  {
    name: "Column",
    schema: z.object({
      children: ChildListSchema.optional(),
      gap: z.enum(["sm", "md", "lg"]).optional(),
    }),
  },
  ({ buildChild, context, props }) => (
    <div
      className={cn(
        "flex flex-col",
        GAP_CLASSES[typeof props.gap === "string" ? props.gap : "md"]
      )}
    >
      <A2uiChildren
        buildChild={buildChild}
        context={context}
        value={props.children}
      />
    </div>
  )
);

export const Inline = createComponentImplementation(
  {
    name: "Inline",
    schema: z.object({
      children: ChildListSchema.optional(),
      gap: z.enum(["sm", "md", "lg"]).optional(),
    }),
  },
  ({ buildChild, context, props }) => (
    <div
      className={cn(
        "flex flex-wrap items-end [&>*]:min-w-32 [&>*]:flex-1",
        GAP_CLASSES[typeof props.gap === "string" ? props.gap : "md"]
      )}
    >
      <A2uiChildren
        buildChild={buildChild}
        context={context}
        value={props.children}
      />
    </div>
  )
);

export const Card = createComponentImplementation(
  {
    name: "Card",
    schema: z.object({
      children: ChildListSchema.optional(),
      title: DynamicStringSchema.optional(),
    }),
  },
  ({ buildChild, context, props }) => {
    const title = asText(props.title);
    // The surface's own frame is the bubble; a root Card inside it would be
    // a box in a box, so it keeps its content and drops its chrome.
    if (context.componentModel.id === "root") {
      return (
        <div className="flex flex-col gap-1">
          {title ? (
            <div className="font-medium text-foreground text-sm">{title}</div>
          ) : null}
          <A2uiChildren
            buildChild={buildChild}
            context={context}
            value={props.children}
          />
        </div>
      );
    }
    return (
      <UiCard className="mx-2 my-1">
        {title ? (
          <CardHeader>
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
        ) : null}
        <CardContent className="flex flex-col">
          <A2uiChildren
            buildChild={buildChild}
            context={context}
            value={props.children}
          />
        </CardContent>
      </UiCard>
    );
  }
);

export const Divider = createComponentImplementation(
  { name: "Divider", schema: z.object({}) },
  () => <Separator className="my-1" />
);

/**
 * Tiles wrap: as many as fit the surface at their minimum width, never more
 * than `columns` — a phone gets one or two per row, the side pane all of them.
 */
const GRID_COLS: Record<number, string> = {
  2: "grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]",
  3: "grid-cols-[repeat(auto-fit,minmax(min(100%,7.5rem),1fr))]",
  4: "grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))]",
};

export const Grid = createComponentImplementation(
  {
    name: "Grid",
    schema: z.object({
      children: ChildListSchema.optional(),
      columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    }),
  },
  ({ buildChild, context, props }) => {
    const columns =
      typeof props.columns === "number" && GRID_COLS[props.columns]
        ? props.columns
        : 2;
    return (
      <div className={cn("grid gap-2 px-2 py-1", GRID_COLS[columns])}>
        <A2uiChildren
          buildChild={buildChild}
          context={context}
          value={props.children}
        />
      </div>
    );
  }
);
