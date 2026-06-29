import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext,
} from "react-hook-form";
import { cn } from "../../lib/utils";
import { Slot } from "../../lib/slot";
import { Label } from "./label";

const formItemVariants = cva("", {
  variants: {
    variant: {
      classic: "space-y-2",
      row: "flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 [&_[data-slot=form-control]]:min-w-0 [&_[data-slot=form-control]]:flex-1 [&_[data-slot=form-label]]:shrink-0 [&_[data-slot=form-label]]:sm:w-48 [&_[data-slot=form-label]]:md:w-56",
    },
  },
  defaultVariants: {
    variant: "classic",
  },
});

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
);

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof formItemVariants>
>(({ className, variant = "classic", ...props }, ref) => {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        className={cn(formItemVariants({ variant }), className)}
        ref={ref}
        {...props}
      />
    </FormItemContext.Provider>
  );
});
FormItem.displayName = "FormItem";

const FormLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField();

  return (
    <Label
      className={cn(error && "text-destructive", className)}
      data-slot="form-label"
      htmlFor={formItemId}
      ref={ref}
      {...props}
    />
  );
});
FormLabel.displayName = "FormLabel";

const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();

  return (
    <Slot
      aria-describedby={
        error ? `${formDescriptionId} ${formMessageId}` : `${formDescriptionId}`
      }
      aria-invalid={!!error}
      data-slot="form-control"
      id={formItemId}
      ref={ref}
      {...props}
    />
  );
});
FormControl.displayName = "FormControl";

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField();

  return (
    <p
      className={cn("text-muted-foreground text-sm", className)}
      id={formDescriptionId}
      ref={ref}
      {...props}
    />
  );
});
FormDescription.displayName = "FormDescription";

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error.message) : children;

  if (!body) {
    return null;
  }

  return (
    <p
      className={cn("font-medium text-destructive text-sm", className)}
      id={formMessageId}
      ref={ref}
      {...props}
    >
      {body}
    </p>
  );
});
FormMessage.displayName = "FormMessage";

export {
  useFormField,
  Form,
  FormItem,
  formItemVariants,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};
