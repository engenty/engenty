"use client";

import { createComponentImplementation } from "@a2ui/react/v0_9";
import { DynamicNumberSchema, DynamicStringSchema } from "@a2ui/web_core/v0_9";
import { Input, Textarea } from "@engenty/ui-core";
import { useId } from "react";
import { z } from "zod";
import {
  Field,
  inputBaseShape,
  useBoundValue,
  useInputField,
} from "./fields.js";
import { asText } from "./host.js";

export const TextField = createComponentImplementation(
  {
    name: "TextField",
    schema: z.object({
      ...inputBaseShape,
      placeholder: z.string().optional(),
      value: DynamicStringSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const bound = useBoundValue(context, props);
    const value = asText(bound.value);
    const field = useInputField(context, props, value.trim() === "");
    const id = useId();
    return (
      <Field
        error={field.error}
        help={props.help}
        htmlFor={id}
        label={props.label}
        required={field.required}
      >
        <Input
          aria-invalid={field.error ? true : undefined}
          aria-required={field.required || undefined}
          disabled={field.disabled}
          id={id}
          onChange={(e) => bound.setValue(e.target.value)}
          placeholder={asText(props.placeholder) || undefined}
          value={value}
        />
      </Field>
    );
  }
);

export const TextArea = createComponentImplementation(
  {
    name: "TextArea",
    schema: z.object({
      ...inputBaseShape,
      placeholder: z.string().optional(),
      rows: z.number().optional(),
      value: DynamicStringSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const bound = useBoundValue(context, props);
    const value = asText(bound.value);
    const field = useInputField(context, props, value.trim() === "");
    const id = useId();
    return (
      <Field
        error={field.error}
        help={props.help}
        htmlFor={id}
        label={props.label}
        required={field.required}
      >
        <Textarea
          aria-invalid={field.error ? true : undefined}
          aria-required={field.required || undefined}
          disabled={field.disabled}
          id={id}
          onChange={(e) => bound.setValue(e.target.value)}
          placeholder={asText(props.placeholder) || undefined}
          rows={typeof props.rows === "number" ? props.rows : 3}
          value={value}
        />
      </Field>
    );
  }
);

export const NumberField = createComponentImplementation(
  {
    name: "NumberField",
    schema: z.object({
      ...inputBaseShape,
      max: z.number().optional(),
      min: z.number().optional(),
      step: z.number().optional(),
      value: DynamicNumberSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const bound = useBoundValue(context, props);
    const value =
      typeof bound.value === "number" && Number.isFinite(bound.value)
        ? bound.value
        : undefined;
    const field = useInputField(context, props, value === undefined);
    const id = useId();
    // An emptied field removes the key from the data model (the data model
    // deletes a key set to undefined) instead of writing NaN.
    const setValue = bound.setValue as (next: number | undefined) => void;
    return (
      <Field
        error={field.error}
        help={props.help}
        htmlFor={id}
        label={props.label}
        required={field.required}
      >
        <Input
          aria-invalid={field.error ? true : undefined}
          aria-required={field.required || undefined}
          disabled={field.disabled}
          id={id}
          max={typeof props.max === "number" ? props.max : undefined}
          min={typeof props.min === "number" ? props.min : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            setValue(raw === "" ? undefined : Number(raw));
          }}
          step={typeof props.step === "number" ? props.step : undefined}
          type="number"
          value={value ?? ""}
        />
      </Field>
    );
  }
);

export const DateInput = createComponentImplementation(
  {
    name: "DateInput",
    schema: z.object({
      ...inputBaseShape,
      max: z.string().optional(),
      min: z.string().optional(),
      value: DynamicStringSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const bound = useBoundValue(context, props);
    const value = asText(bound.value);
    const field = useInputField(context, props, value === "");
    const id = useId();
    return (
      <Field
        error={field.error}
        help={props.help}
        htmlFor={id}
        label={props.label}
        required={field.required}
      >
        <Input
          aria-invalid={field.error ? true : undefined}
          aria-required={field.required || undefined}
          disabled={field.disabled}
          id={id}
          max={asText(props.max) || undefined}
          min={asText(props.min) || undefined}
          onChange={(e) => bound.setValue(e.target.value)}
          type="date"
          value={value}
        />
      </Field>
    );
  }
);
