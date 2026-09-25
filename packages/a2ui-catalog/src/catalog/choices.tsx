"use client";

import { createComponentImplementation } from "@a2ui/react/v0_9";
import {
  DynamicBooleanSchema,
  DynamicStringListSchema,
  DynamicStringSchema,
} from "@a2ui/web_core/v0_9";
import {
  cn,
  Input,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button as UiButton,
  Checkbox as UiCheckbox,
  Select as UiSelect,
} from "@engenty/ui-core";
import { useId } from "react";
import { z } from "zod";
import {
  Field,
  inputBaseShape,
  OptionListSchema,
  optionsOf,
  useBoundValue,
  useInputField,
} from "./fields.js";
import { asText, useEngentyA2uiHost } from "./host.js";

export const Select = createComponentImplementation(
  {
    name: "Select",
    schema: z.object({
      ...inputBaseShape,
      options: OptionListSchema.optional(),
      placeholder: z.string().optional(),
      value: DynamicStringSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const bound = useBoundValue(context, props);
    const value = asText(bound.value);
    const field = useInputField(context, props, value === "");
    const id = useId();
    const options = optionsOf(props.options);
    return (
      <Field
        error={field.error}
        help={props.help}
        htmlFor={id}
        label={props.label}
        required={field.required}
      >
        <UiSelect
          disabled={field.disabled}
          onValueChange={(next) => bound.setValue(next)}
          value={value === "" ? null : value}
        >
          <SelectTrigger
            aria-invalid={field.error ? true : undefined}
            aria-required={field.required || undefined}
            className="w-full"
            id={id}
          >
            <SelectValue placeholder={asText(props.placeholder) || undefined} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label ?? option.value}
              </SelectItem>
            ))}
          </SelectContent>
        </UiSelect>
      </Field>
    );
  }
);

export const MultipleChoice = createComponentImplementation(
  {
    name: "MultipleChoice",
    schema: z.object({
      ...inputBaseShape,
      options: OptionListSchema.optional(),
      style: z.enum(["list", "chips"]).optional(),
      value: DynamicStringListSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const bound = useBoundValue(context, props);
    const selected = Array.isArray(bound.value)
      ? bound.value.filter((v): v is string => typeof v === "string")
      : [];
    const field = useInputField(context, props, selected.length === 0);
    const options = optionsOf(props.options);
    const toggle = (option: string) => {
      bound.setValue(
        selected.includes(option)
          ? selected.filter((v) => v !== option)
          : [...selected, option]
      );
    };
    const chips = props.style === "chips";
    const baseId = useId();
    return (
      <Field
        error={field.error}
        help={props.help}
        label={props.label}
        required={field.required}
      >
        <div
          aria-invalid={field.error ? true : undefined}
          className={cn(
            chips ? "flex flex-wrap gap-1.5" : "flex flex-col gap-1.5"
          )}
          role="group"
        >
          {options.map((option) => {
            const checked = selected.includes(option.value);
            const label = option.label ?? option.value;
            if (chips) {
              return (
                <UiButton
                  aria-pressed={checked}
                  className="h-7 rounded-full px-2.5 text-xs"
                  disabled={field.disabled}
                  key={option.value}
                  onClick={() => toggle(option.value)}
                  size="sm"
                  type="button"
                  variant={checked ? "default" : "outline"}
                >
                  {label}
                </UiButton>
              );
            }
            return (
              <label
                className="flex items-center gap-2 text-foreground/90 text-sm"
                htmlFor={`${baseId}-${option.value}`}
                key={option.value}
              >
                <UiCheckbox
                  checked={checked}
                  disabled={field.disabled}
                  id={`${baseId}-${option.value}`}
                  onCheckedChange={() => toggle(option.value)}
                />
                {label}
              </label>
            );
          })}
        </div>
      </Field>
    );
  }
);

export const CheckBox = createComponentImplementation(
  {
    name: "CheckBox",
    schema: z.object({
      ...inputBaseShape,
      value: DynamicBooleanSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const bound = useBoundValue(context, props);
    const checked = bound.value === true;
    const field = useInputField(context, props, !checked);
    const id = useId();
    const helpText = asText(props.help);
    return (
      <div className="flex flex-col gap-1 px-2 py-1">
        <label
          className="flex items-center gap-2 text-foreground/90 text-sm"
          htmlFor={id}
        >
          <UiCheckbox
            aria-invalid={field.error ? true : undefined}
            aria-required={field.required || undefined}
            checked={checked}
            disabled={field.disabled}
            id={id}
            onCheckedChange={(next) => bound.setValue(next === true)}
          />
          <span>
            {asText(props.label)}
            {field.required ? (
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            ) : null}
          </span>
        </label>
        {field.error ? (
          <p className="text-destructive text-xs" role="alert">
            {field.error}
          </p>
        ) : helpText ? (
          <p className="text-muted-foreground text-xs">{helpText}</p>
        ) : null}
      </div>
    );
  }
);

export const ObjectPicker = createComponentImplementation(
  {
    name: "ObjectPicker",
    schema: z.object({
      ...inputBaseShape,
      entity: z.string(),
      value: DynamicStringSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const host = useEngentyA2uiHost();
    const bound = useBoundValue(context, props);
    const value = asText(bound.value);
    const field = useInputField(context, props, value === "");
    const id = useId();
    const entity = asText(props.entity);
    if (host.renderObjectPicker) {
      return (
        <Field
          error={field.error}
          help={props.help}
          label={props.label}
          required={field.required}
        >
          {host.renderObjectPicker({
            disabled: field.disabled,
            entity,
            onChange: (ref) => bound.setValue(ref ?? ""),
            value: value || null,
          })}
        </Field>
      );
    }
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
          placeholder={entity ? `${entity} ref` : undefined}
          value={value}
        />
      </Field>
    );
  }
);
