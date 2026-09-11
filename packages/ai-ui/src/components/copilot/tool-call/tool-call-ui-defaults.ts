"use client";

import { readA2uiRenderMeta } from "@engenty/ai-core/browser";
import type { ComponentType } from "react";
import {
  ObjectRenderToolCallCard,
  objectRenderToolCallMatch,
} from "../../../objects/object-render-tool-call-card";
import { A2uiToolCallCard } from "./a2ui-tool-call-card";
import { AgentMessageToolCallCard } from "./agent-message-tool-call-card";
import {
  AppBuildToolCallCard,
  matchesAppBuildOutput,
} from "./app-build-tool-call-card";
import {
  DecisionArtifactToolCallCard,
  matchesDecisionArtifactOutput,
} from "./decision-artifact-tool-call-card";
import {
  FeedbackArtifactToolCallCard,
  matchesFeedbackArtifactOutput,
} from "./feedback-artifact-tool-call-card";
import { McpAppToolCallCard, readMcpAppMeta } from "./mcp-app-tool-call-card";
import {
  matchesProposeUpdatesOutput,
  ProposeUpdatesToolCallCard,
} from "./propose-updates-tool-call-card";
import {
  matchesSandboxCommandToolCall,
  SandboxCommandConfirmToolCallCard,
} from "./sandbox-command-confirm-tool-call-card";
import {
  matchesSkillsFindOutput,
  SkillsFindToolCallCard,
} from "./skills-find-tool-call-card";
import { SubAgentTaskToolCallCard } from "./sub-agent-task-tool-call-card";
import type { ToolCallCardProps } from "./tool-call-card.types";
import { ToolCallGenericCard } from "./tool-call-generic-card";
import { ToolCallReasoningCard } from "./tool-call-reasoning-card";
import {
  buildToolCallUiMatchContext,
  registerToolCallUi,
  resolveToolCallUiCard,
} from "./tool-call-ui-registry";
import { ToolCallWebSearchCard } from "./tool-call-web-search-card";

let defaultsRegistered = false;

export function registerDefaultToolCallUiCards() {
  if (defaultsRegistered) {
    return;
  }
  defaultsRegistered = true;

  registerToolCallUi({
    id: "core_web_search",
    priority: 100,
    match: (ctx) => ctx.toolName === "web_search",
    Card: ToolCallWebSearchCard,
  });
  registerToolCallUi({
    id: "core_reasoning",
    priority: 100,
    match: (ctx) => ctx.toolName === "reasoning",
    Card: ToolCallReasoningCard,
  });
  registerToolCallUi({
    id: "core.decision-artifact",
    priority: 50,
    // Output OR tool name. `requestDecision` suspends the run natively now
    // (apps/ai native-request-decision.ts) and hands its artifact over as the
    // SUSPEND payload, so the call has no output to match on — matching output
    // alone routed every suspended chooser to the generic card, which rendered a
    // spinning "Decision needed" row and no way to answer it. Tool-approval
    // cards still arrive as an output artifact under a different tool name, so
    // both arms are load-bearing. `workflow_propose` parks on its Publish card
    // the same way; once answered, its rich result has no artifact to parse
    // and the card falls back to the generic row by design.
    match: (ctx) =>
      ctx.toolName === "requestDecision" ||
      ctx.toolName === "workflow_propose" ||
      matchesDecisionArtifactOutput(ctx.output),
    Card: DecisionArtifactToolCallCard,
  });
  registerToolCallUi({
    id: "core.feedback-artifact",
    priority: 51,
    match: (ctx) => matchesFeedbackArtifactOutput(ctx.output),
    Card: FeedbackArtifactToolCallCard,
  });
  registerToolCallUi({
    id: "core.propose-updates",
    priority: 52,
    match: (ctx) => matchesProposeUpdatesOutput(ctx.output),
    Card: ProposeUpdatesToolCallCard,
  });
  registerToolCallUi({
    id: "core.sandbox-command-confirmation",
    priority: 54,
    match: (ctx) =>
      matchesSandboxCommandToolCall(ctx.toolName, ctx.state ?? "running"),
    Card: SandboxCommandConfirmToolCallCard,
  });
  registerToolCallUi({
    id: "core.object-render",
    priority: 55,
    match: (ctx) => objectRenderToolCallMatch(ctx),
    Card: ObjectRenderToolCallCard,
  });
  registerToolCallUi({
    id: "core.a2ui",
    priority: 58,
    match: (ctx) => readA2uiRenderMeta(ctx.output) !== null,
    Card: A2uiToolCallCard,
  });
  registerToolCallUi({
    id: "core.mcp-app",
    priority: 60,
    match: (ctx) => readMcpAppMeta(ctx.output) !== null,
    Card: McpAppToolCallCard,
  });
  registerToolCallUi({
    id: "core.app-build",
    priority: 62,
    match: (ctx) => matchesAppBuildOutput(ctx.output),
    Card: AppBuildToolCallCard,
  });
  registerToolCallUi({
    id: "core.skills-find",
    priority: 50,
    match: (ctx) => matchesSkillsFindOutput(ctx),
    Card: SkillsFindToolCallCard,
    standalone: true,
  });
  registerToolCallUi({
    id: "core.sub-agent-task",
    priority: 80,
    match: (ctx) => ctx.toolName.startsWith("agent-"),
    Card: SubAgentTaskToolCallCard,
  });
  registerToolCallUi({
    id: "core.agent-message",
    priority: 90,
    match: (ctx) => ctx.toolName === "message_agent",
    Card: AgentMessageToolCallCard,
  });
}

export function resolveRoutedToolCallCard(
  props: ToolCallCardProps
): ComponentType<ToolCallCardProps> {
  registerDefaultToolCallUiCards();

  const ctx = buildToolCallUiMatchContext(props);
  const registered = resolveToolCallUiCard(ctx);
  if (registered) {
    return registered;
  }

  return ToolCallGenericCard;
}
