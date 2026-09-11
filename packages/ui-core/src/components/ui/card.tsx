import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils";

const cardVariants = cva("", {
  variants: {
    variant: {
      default: "ui-card-panel p-2 text-card-foreground sm:p-4",
      form: "ui-card-panel space-y-2 p-2 text-foreground sm:space-y-3 sm:p-4",
      /** Page-embedded section: no fill, no frame, no outer padding (use with `CardHeader`/`CardContent` `p-0`). */
      panel:
        "rounded-none border-0 bg-transparent p-0 text-foreground shadow-none",
      settings: "ui-card-panel space-y-1 p-0 text-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function Card({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      className={cn(cardVariants({ variant }), className)}
      data-slot="card"
      data-variant={variant}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 p-6", className)}
      data-slot="card-header"
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      className={cn("font-semibold leading-none tracking-tight", className)}
      data-slot="card-title"
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="card-description"
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("p-4 pt-0", className)}
      data-slot="card-content"
      {...props}
    />
  );
}

const cardCaptionPositionVariants = {
  top: "space-y-1 mb-4 pb-4 border-b border-border",
};

function CardCaption({
  position = "top",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  position?: keyof typeof cardCaptionPositionVariants;
}) {
  return (
    <div
      className={cn(cardCaptionPositionVariants[position], className)}
      data-position={position}
      data-slot="card-caption"
      {...props}
    />
  );
}

export {
  Card,
  CardContent,
  CardCaption,
  CardDescription,
  CardHeader,
  CardTitle,
  cardVariants,
};
