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
    <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
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

const GRID_COLS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
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
