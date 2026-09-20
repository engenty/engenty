"use client";

import {
  createComponentImplementation,
  type ReactComponentImplementation,
} from "@a2ui/react/v0_9";
import {
  ActionSchema,
  Catalog,
  ChildListSchema,
  type ComponentContext,
  DynamicBooleanSchema,
  DynamicNumberSchema,
  DynamicStringListSchema,
  DynamicStringSchema,
  DynamicValueSchema,
} from "@a2ui/web_core/v0_9";
import {
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Input,
  Label,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  Badge as UiBadge,
  Button as UiButton,
  Card as UiCard,
  Checkbox as UiCheckbox,
  Select as UiSelect,
  Table as UiTable,
} from "@engenty/ui-core";
import {
  createContext,
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
// NOTE: this package's `zod` is v3 — the version @a2ui/web_core schemas are
// built with. Do not import workspace-level zod4 helpers here.
import { z } from "zod";
import { type RequiredFieldState, SurfaceFormContext } from "./form-context.js";
import { renderMarkdown } from "./markdown.js";
import { ENGENTY_A2UI_CATALOG_ID } from "./spec.js";

/**
 * The engenty A2UI catalog, client side (docs/wip/generative-ui.md §5/§5b):
 * chrome-less components mapped onto ui-core primitives, rendered natively by
 * `@a2ui/react` — theme, query cache, and router for free, no sandbox needed
 * (UI-as-data: the agent can only reference these components).
 *
 * Inputs declare `value` with a Dynamic*Schema, so the binder resolves a
 * `{path}` binding to the current data-model value and hands the component a
 * generated `setValue` that writes back to that path — two-way, with no state
 * of its own. The surface view reads the whole model at submit time.
 */

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

/**
 * A container's children: a static list of ids, or a template the binder
 * turned into one `{ id, basePath }` per array item.
 *
 * The template is also resolved here from the raw `{ componentId, path }`,
 * for the same reason `useBoundValue` writes through the data context: when
 * the binder does not recognise our schemas it hands every prop through
 * untouched, and an unresolved template would render nothing at all.
 */
function A2uiChildren({
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

function lengthOf(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * A prop the binder left as a raw `{ path }` binding, read from the data
 * context instead — the counterpart of `useBoundValue` for props a component
 * only reads (see the note there on why a binding can arrive unresolved).
 */
function useResolvedProp(
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

function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

/**
 * Read a cell by column key: a plain key, or a pointer into the row
 * ("content_json/amount", "content_json.amount") for records that keep their
 * payload nested — the same rows an operation reads and writes.
 */
function readCell(row: Record<string, unknown>, key: string): unknown {
  if (key in row) {
    return row[key];
  }
  let current: unknown = row;
  for (const segment of key.split(/[./]/)) {
    if (!(current && typeof current === "object")) {
      return;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function cellText(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "✓" : "";
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return asText(value);
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
function resolveA2uiActionHandler(
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

const List = createComponentImplementation(
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

const Row = createComponentImplementation(
  RowApi,
  ({ buildChild, context, props }) => {
    const host = useContext(EngentyA2uiHostContext);
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

const Button = createComponentImplementation(
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

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const REQUIRED_MESSAGE = "Required";

const inputBaseShape = {
  disabled: z.boolean().optional(),
  help: z.string().optional(),
  label: z.string().optional(),
  required: z.boolean().optional(),
};

const OptionListSchema = z.array(
  z.object({ label: z.string().optional(), value: z.string() })
);

interface Option {
  label?: string;
  value: string;
}

function optionsOf(value: unknown): Option[] {
  return Array.isArray(value)
    ? value.filter(
        (o): o is Option =>
          Boolean(o) && typeof o === "object" && typeof o.value === "string"
      )
    : [];
}

/**
 * Register this input with the surface view's required-field registry and
 * read back the surface-wide read-only flag and the submit-time error.
 */
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
function useBoundValue(
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

function useInputField(
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

function Field({
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

const TextField = createComponentImplementation(
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

const TextArea = createComponentImplementation(
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

const NumberField = createComponentImplementation(
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

const Select = createComponentImplementation(
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

const MultipleChoice = createComponentImplementation(
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

const CheckBox = createComponentImplementation(
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

const DateInput = createComponentImplementation(
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

const ObjectPicker = createComponentImplementation(
  {
    name: "ObjectPicker",
    schema: z.object({
      ...inputBaseShape,
      entity: z.string(),
      value: DynamicStringSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const host = useContext(EngentyA2uiHostContext);
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

const Form = createComponentImplementation(
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

// ---------------------------------------------------------------------------
// Layout and output
// ---------------------------------------------------------------------------

const GAP_CLASSES: Record<string, string> = {
  lg: "gap-4",
  md: "gap-2",
  sm: "gap-1",
};

const Column = createComponentImplementation(
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

const Inline = createComponentImplementation(
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

const Card = createComponentImplementation(
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

const Divider = createComponentImplementation(
  { name: "Divider", schema: z.object({}) },
  () => <Separator className="my-1" />
);

const CALLOUT_TONE_CLASSES: Record<string, string> = {
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200",
  success:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  warning:
    "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
};

const Callout = createComponentImplementation(
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

const Markdown = createComponentImplementation(
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

const Image = createComponentImplementation(
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

const Table = createComponentImplementation(
  {
    name: "Table",
    schema: z.object({
      columns: z
        .array(
          z.object({
            align: z.enum(["start", "end"]).optional(),
            key: z.string(),
            label: z.string().optional(),
          })
        )
        .optional(),
      rows: DynamicValueSchema.optional(),
    }),
  },
  ({ context, props }) => {
    const rowsProp = useResolvedProp(context, "rows", props.rows);
    const columns = Array.isArray(props.columns)
      ? props.columns.filter(
          (c): c is { align?: "end" | "start"; key: string; label?: string } =>
            Boolean(c) && typeof c === "object" && typeof c.key === "string"
        )
      : [];
    const rows = Array.isArray(rowsProp)
      ? rowsProp.filter(
          (r): r is Record<string, unknown> =>
            Boolean(r) && typeof r === "object"
        )
      : [];
    if (columns.length === 0) {
      return null;
    }
    return (
      <div className="px-2 py-1">
        <UiTable>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  className={column.align === "end" ? "text-right" : undefined}
                  key={column.key}
                >
                  {column.label ?? column.key}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell
                    className={
                      column.align === "end"
                        ? "text-right tabular-nums"
                        : undefined
                    }
                    key={column.key}
                  >
                    {cellText(readCell(row, column.key))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </UiTable>
      </div>
    );
  }
);

const Document = createComponentImplementation(
  {
    name: "Document",
    schema: z.object({ artifactRef: DynamicStringSchema.optional() }),
  },
  ({ props }) => {
    const host = useContext(EngentyA2uiHostContext);
    const artifactId = asText(props.artifactRef);
    if (!artifactId) {
      return null;
    }
    if (host.renderArtifact) {
      return <>{host.renderArtifact(artifactId)}</>;
    }
    return (
      <p className="px-2 text-muted-foreground text-xs">
        Artifact {artifactId}
      </p>
    );
  }
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
    Form,
    TextField,
    TextArea,
    NumberField,
    Select,
    MultipleChoice,
    CheckBox,
    DateInput,
    ObjectPicker,
    Column,
    Inline,
    Card,
    Divider,
    Callout,
    Markdown,
    Image,
    Table,
    Document,
  ]);
}
