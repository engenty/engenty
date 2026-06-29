"use client";

import { cn, InputGroupButton, Spinner } from "@engenty/ui-core";
import type { ChatStatus } from "ai";
import { CornerDownLeftIcon, SquareIcon, XIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback } from "react";

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: ChatStatus;
  onStop?: () => void;
};

export const PromptInputSubmit = ({
  className,
  variant = "default",
  size = "icon-sm",
  status,
  onStop,
  onClick,
  children,
  ...props
}: PromptInputSubmitProps) => {
  const isGenerating = status === "submitted" || status === "streaming";
  const isStopMode = isGenerating && onStop != null;

  let Icon = <CornerDownLeftIcon className="size-4" />;

  if (status === "submitted") {
    Icon = <Spinner />;
  } else if (status === "streaming" && !isStopMode) {
    Icon = <SquareIcon className="size-4" />;
  } else if (status === "error") {
    Icon = <XIcon className="size-4" />;
  }

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isStopMode) {
        e.preventDefault();
        onStop();
        return;
      }
      onClick?.(e);
    },
    [isStopMode, onStop, onClick]
  );

  if (isStopMode && children == null) {
    return (
      <InputGroupButton
        aria-label="Stop generation"
        className={cn(
          "group/prompt-stop relative text-muted-foreground hover:text-destructive",
          className
        )}
        onClick={handleClick}
        size={size}
        type="button"
        variant={variant === "default" ? "ghost" : variant}
        {...props}
      >
        <Spinner className="size-4 transition-opacity group-hover/prompt-stop:opacity-0" />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/prompt-stop:opacity-100"
        >
          <SquareIcon className="size-3.5 fill-destructive text-destructive" />
        </span>
      </InputGroupButton>
    );
  }

  return (
    <InputGroupButton
      aria-label={isStopMode ? "Stop generation" : "Submit"}
      className={cn(className)}
      onClick={handleClick}
      size={size}
      type={isStopMode ? "button" : "submit"}
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </InputGroupButton>
  );
};
