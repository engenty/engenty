import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { mergeClassNameOntoRender } from "../../lib/as-child";
import { focusVisibleRingSubtle } from "../../lib/focus-visible";
import { cn } from "../../lib/utils";

function isNativeButtonElement(element: React.ReactElement): boolean {
  return element.type === "button";
}

const buttonVariants = cva(
  `group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/35 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 ${focusVisibleRingSubtle}`,
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40 dark:bg-destructive/60 dark:focus-visible:ring-destructive/50",
        outline:
          "border border-border bg-transparent text-foreground shadow-none hover:bg-card hover:border-border hover:text-foreground active:bg-muted aria-pressed:border-border aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:hover:bg-accent aria-pressed:hover:text-accent-foreground dark:border-border dark:bg-transparent dark:text-foreground dark:hover:bg-card dark:hover:text-foreground dark:active:bg-input/65 dark:aria-pressed:bg-accent dark:aria-pressed:text-accent-foreground dark:aria-pressed:hover:bg-accent dark:aria-pressed:hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/65",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/85 dark:hover:bg-accent/50 dark:active:bg-accent/65",
        link: "text-link underline-offset-4 hover:underline",
        ai: "bg-gradient-to-br from-ember via-primary to-ember-strong text-primary-foreground shadow-sm hover:from-[color-mix(in_oklch,var(--ember)_92%,black)] hover:via-primary hover:to-[color-mix(in_oklch,var(--ember-strong)_88%,black)] hover:shadow-md dark:from-primary dark:via-ember dark:to-ember-strong dark:hover:from-ember dark:hover:via-primary dark:hover:to-ember-strong",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  render,
  nativeButton,
  onClick,
  ...props
}: Omit<ButtonPrimitive.Props, "onClick"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    onClick?: React.MouseEventHandler<HTMLElement>;
  }) {
  const classes = cn(buttonVariants({ variant, size, className }));
  const handleClick = onClick
    ? (event: Parameters<NonNullable<ButtonPrimitive.Props["onClick"]>>[0]) => {
        onClick(event as unknown as React.MouseEvent<HTMLElement>);
      }
    : undefined;

  if (asChild && React.isValidElement<{ className?: string }>(children)) {
    return (
      <ButtonPrimitive
        data-slot="button"
        data-variant={variant}
        data-size={size}
        nativeButton={nativeButton ?? isNativeButtonElement(children)}
        render={mergeClassNameOntoRender(children, classes)}
        onClick={handleClick}
        {...props}
      />
    );
  }

  if (render) {
    return (
      <ButtonPrimitive
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={classes}
        nativeButton={nativeButton ?? false}
        render={render}
        onClick={handleClick}
        {...props}
      />
    );
  }

  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={classes}
      onClick={handleClick}
      {...props}
    >
      {children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
