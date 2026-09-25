"use client";

import { createComponentImplementation } from "@a2ui/react/v0_9";
import { ActionSchema, ChildListSchema } from "@a2ui/web_core/v0_9";
import { z } from "zod";
import { A2uiChildren, resolveA2uiActionHandler } from "./host.js";

export const Form = createComponentImplementation(
  {
    name: "Form",
    schema: z.object({
      children: ChildListSchema.optional(),
      submit: ActionSchema.optional(),
    }),
  },
  ({ buildChild, context, props }) => {
    const submit = resolveA2uiActionHandler(props.submit, context);
    return (
      <form
        className="flex flex-col gap-1"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit?.();
        }}
      >
        <A2uiChildren
          buildChild={buildChild}
          context={context}
          value={props.children}
        />
        {submit ? (
          // Default button so Enter in any input submits the form; the
          // visible Buttons are type="button" and keep their own events.
          <button
            aria-hidden="true"
            className="hidden"
            tabIndex={-1}
            type="submit"
          />
        ) : null}
      </form>
    );
  }
);
