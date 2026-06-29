"use client";

import type { ComponentType } from "react";
import type { ToolCallCardProps } from "./tool-call-card.types";

export interface ToolCallUiMatchContext {
  displayLabel?: string;
  input?: unknown;
  output?: unknown;
  resolvedToolName?: string;
  state?: ToolCallCardProps["state"];
  toolName: string;
}

export interface ToolCallUiRegistration {
  Card: ComponentType<ToolCallCardProps>;
  id: string;
  match: (ctx: ToolCallUiMatchContext) => boolean;
  priority?: number;
}

const registrations = new Map<string, ToolCallUiRegistration>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function registerToolCallUi(reg: ToolCallUiRegistration): () => void {
  registrations.set(reg.id, reg);
  emit();
  return () => {
    registrations.delete(reg.id);
    emit();
  };
}

export function clearToolCallUiRegistrationsForTests() {
  registrations.clear();
  emit();
}

export function listToolCallUiRegistrations(): ToolCallUiRegistration[] {
  return [...registrations.values()].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );
}

export function resolveToolCallUiCard(
  ctx: ToolCallUiMatchContext
): ComponentType<ToolCallCardProps> | null {
  for (const reg of listToolCallUiRegistrations()) {
    if (reg.match(ctx)) {
      return reg.Card;
    }
  }
  return null;
}

export function subscribeToolCallUiRegistry(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function buildToolCallUiMatchContext(
  props: ToolCallCardProps
): ToolCallUiMatchContext {
  return {
    toolName: props.toolName,
    resolvedToolName: props.resolvedToolName ?? props.toolName,
    displayLabel: props.displayLabel,
    input: props.input,
    output: props.output,
    state: props.state,
  };
}
