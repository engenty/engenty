// Schema for the Action Job workflow (Phase 5). An Action is a Workflow on the
// Job substrate: the foreground POST endpoint resolves + validates the action,
// creates the run/thread/action_request (for dedup + observability), then starts
// this workflow with the resolved, non-secret inputs. The workflow runs the
// action's scoped specialist and finalizes the action_request.
import { fieldSuggestionSchema } from "@engenty/ai-core";
import { z } from "zod";

export const actionJobInputSchema = z.object({
  // The assigned agent, narrowed to `allowed_tools` (the action guardrail).
  agent_id: z.string().min(1),
  action_id: z.string().min(1),
  allowed_tools: z.array(z.string()).optional(),
  // Pre-built opening message: action prompt + input + subject hint.
  brief: z.string(),
  context_id: z.string().optional(),
  context_type: z.string().optional(),
  // The ai.action_request row id — finalized (completed/failed) by this workflow.
  request_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  // The ai.thread the run executes on (created by the endpoint before start).
  thread_id: z.string().uuid(),
});

export type ActionJobInput = z.infer<typeof actionJobInputSchema>;

export const actionJobOutputSchema = z.object({
  request_id: z.string().uuid(),
  status: z.enum(["completed", "failed"]),
});

export type ActionJobOutput = z.infer<typeof actionJobOutputSchema>;

// One approved field update (the user's reviewed value for a proposed field).
export const actionFieldUpdateSchema = z.object({
  field: z.string(),
  value: z.union([z.string(), z.null()]),
});
export type ActionFieldUpdate = z.infer<typeof actionFieldUpdateSchema>;

// HITL approval gate (run-action-specialist step):
//   suspend payload  = the proposal shown to the user (durable on the snapshot).
//   resume payload   = the user's decision, supplied by POST /approve.
export const actionApprovalSuspendSchema = z.object({
  artifact_id: z.string().optional(),
  context_id: z.string().optional(),
  context_type: z.string().optional(),
  suggestions: z.array(fieldSuggestionSchema),
});
export type ActionApprovalSuspend = z.infer<typeof actionApprovalSuspendSchema>;

export const actionApprovalResumeSchema = z.object({
  approved: z.array(actionFieldUpdateSchema).default([]),
  rejected: z.boolean().optional(),
});
export type ActionApprovalResume = z.infer<typeof actionApprovalResumeSchema>;

// The specialist step's output, threaded to apply-updates → finalize. Carries the
// approved patch + subject so apply-updates can write generically by context_type.
export const actionSpecialistOutSchema = z.object({
  approved: z.array(actionFieldUpdateSchema).default([]),
  context_id: z.string().optional(),
  context_type: z.string().optional(),
  reason: z.string().optional(),
  request_id: z.string().uuid(),
  status: z.enum(["completed", "failed"]),
  tenant_id: z.string().uuid(),
});
export type ActionSpecialistOut = z.infer<typeof actionSpecialistOutSchema>;
