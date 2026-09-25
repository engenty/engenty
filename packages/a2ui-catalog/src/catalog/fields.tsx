"use client";

import type { ComponentContext } from "@a2ui/web_core/v0_9";
import { Label } from "@engenty/ui-core";
import {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import {
  type RequiredFieldState,
  SurfaceFormContext,
} from "../form-context.js";
import { asText } from "./host.js";

const REQUIRED_MESSAGE = "Required";

export const inputBaseShape = {
  disabled: z.boolean().optional(),
  help: z.string().optional(),
  label: z.string().optional(),
  required: z.boolean().optional(),
};

export const OptionListSchema = z.array(
  z.object({ label: z.string().optional(), value: z.string() })
);

export interface Option {
  label?: string;
  value: string;
}

export function optionsOf(value: unknown): Option[] {
  return Array.isArray(value)
    ? value.filter(
        (o): o is Option =>
          Boolean(o) && typeof o === "object" && typeof o.value === "string"
      )
    : [];
}

/**
 * The bound `value` of an input and its setter.
 *
 * When the binder resolved the schema it hands the component a live value and
 * a generated `setValue` that writes to the bound path. The binder reads zod
 * internals by major version, and a bundle that resolves `zod` differently
 * for `@a2ui/web_core` than for this package leaves inputs without a setter
 * (the same mismatch `resolveA2uiActionHandler` covers for actions). Then the
 * component reads the raw `{ path }` off its model and goes through the data
 * context itself — subscribed for reads, `set` for writes — so typing works
 * either way and the surface's data model stays the one source of truth.
 */
export function useBoundValue(
  context: ComponentContext,
  props: { setValue?: unknown; value?: unknown }
): { setValue: (next: unknown) => void; value: unknown } {
  const raw = (
    context.componentModel.properties as Record<string, unknown> | undefined
  )?.value;
  const path =
    raw &&
    typeof raw === "object" &&
    typeof (raw as { path?: unknown }).path === "string"
      ? (raw as { path: string }).path
      : null;
  const binderSetter =
    typeof props.setValue === "function"
      ? (props.setValue as (next: unknown) => void)
      : null;
  const bound = path !== null && binderSetter === null;
  const [local, setLocal] = useState<unknown>(() =>
    bound
      ? context.dataContext.resolveDynamicValue({ path } as never)
      : undefined
  );
  useEffect(() => {
    if (!(bound && path)) {
      return;
    }
    const subscription = context.dataContext.subscribeDynamicValue(
      { path } as never,
      (next) => setLocal(next)
    );
    setLocal(subscription.value);
    return () => subscription.unsubscribe();
  }, [bound, context, path]);
  const setValue = useCallback(
    (next: unknown) => {
      if (binderSetter) {
        binderSetter(next);
        return;
      }
      if (path !== null) {
        context.dataContext.set(path, next);
      }
      setLocal(next);
    },
    [binderSetter, context, path]
  );
  return { setValue, value: bound ? local : props.value };
}

export function useInputField(
  context: ComponentContext,
  props: { disabled?: unknown; required?: unknown },
  empty: boolean
): { disabled: boolean; error: string | null; required: boolean } {
  const form = useContext(SurfaceFormContext);
  const componentId = context.componentModel.id;
  const required = props.required === true;
  const state = useRef<RequiredFieldState>({ empty, required });
  state.current = { empty, required };
  const register = form.register;
  useEffect(() => register(componentId, state), [componentId, register]);
  return {
    disabled: form.readOnly || props.disabled === true,
    error: form.requiredErrors.has(componentId) ? REQUIRED_MESSAGE : null,
    required,
  };
}

export function Field({
  children,
  error,
  help,
  htmlFor,
  label,
  required,
}: {
  children: ReactNode;
  error: string | null;
  help?: unknown;
  htmlFor?: string;
  label?: unknown;
  required: boolean;
}) {
  const labelText = asText(label);
  const helpText = asText(help);
  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      {labelText ? (
        <Label className="text-muted-foreground text-xs" htmlFor={htmlFor}>
          {labelText}
          {required ? (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          ) : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : helpText ? (
        <p className="text-muted-foreground text-xs">{helpText}</p>
      ) : null}
    </div>
  );
}
