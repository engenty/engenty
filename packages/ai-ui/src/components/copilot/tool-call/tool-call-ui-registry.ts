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
  /**
   * Full-width interactive surface that must escape the collapsed "Used N
   * tools" timeline. Live streaming often splits a turn across rotated
   * assistant messages (tools land AFTER that message's last text → rendered
   * inline), but the persisted row coalesces the whole turn into one message
   * (tools land BEFORE the last text → folded into the timeline) — a card
   * folded into a one-line step is not a rendered card, so the reload lost it.
   */
  standalone?: boolean;
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

/** True when a `standalone` registration claims this call (see the flag doc). */
export function hasStandaloneToolCallUi(ctx: ToolCallUiMatchContext): boolean {
  for (const reg of listToolCallUiRegistrations()) {
    if (reg.standalone && reg.match(ctx)) {
      return true;
    }
  }
  return false;
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
