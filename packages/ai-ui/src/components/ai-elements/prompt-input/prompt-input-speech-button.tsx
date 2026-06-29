"use client";

import { cn, InputGroupButton } from "@engenty/ui-core";
import { AnimatedLoaderIcon } from "@engenty/ui-icons";
import { Mic, MicOff } from "lucide-react";
import type { ComponentProps } from "react";

export type PromptInputSpeechButtonProps = Omit<
  ComponentProps<typeof InputGroupButton>,
  "onClick"
> & {
  disabled?: boolean;
  isListening?: boolean;
  isProcessing?: boolean;
  listeningLabel?: string;
  onToggle?: () => void;
  startLabel?: string;
  stopLabel?: string;
};

export function PromptInputSpeechButton({
  className,
  disabled = false,
  isListening = false,
  isProcessing = false,
  listeningLabel = "Stop voice input",
  onToggle,
  size = "icon-xs",
  startLabel = "Start voice input",
  stopLabel = "Stop voice input",
  type = "button",
  variant = "ghost",
  ...props
}: PromptInputSpeechButtonProps) {
  const isActive = isListening || isProcessing;
  const label = isProcessing
    ? "Transcribing…"
    : isListening
      ? stopLabel || listeningLabel
      : startLabel;

  return (
    <InputGroupButton
      aria-label={label}
      aria-pressed={isListening}
      className={cn(
        "text-muted-foreground",
        isListening && "animate-pulse text-primary",
        className
      )}
      disabled={disabled || isProcessing}
      onClick={onToggle}
      size={size}
      type={type}
      variant={variant}
      {...props}
    >
      {isProcessing ? (
        <AnimatedLoaderIcon aria-hidden play="always" size="sm" />
      ) : isActive ? (
        <MicOff aria-hidden className="size-4" />
      ) : (
        <Mic aria-hidden className="size-4" />
      )}
    </InputGroupButton>
  );
}
