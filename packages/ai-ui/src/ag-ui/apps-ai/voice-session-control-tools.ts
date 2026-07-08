/**
 * Frontend tool definitions that allow the voice agent to control its own
 * session: end the call, mute/unmute, or start a new session.
 *
 * These are registered as safe, auto-executed tools — no user confirmation
 * needed since the user can always override via the FAB controls.
 */

import { createFrontendToolDefinition } from "@engenty/ag-ui-bridge";

/* -------------------------------------------------------------------------- */
/*  Tool definitions                                                          */
/* -------------------------------------------------------------------------- */

export const VOICE_END_SESSION_TOOL = createFrontendToolDefinition({
  availability: "enabled",
  description:
    "End the current voice chat session. Use when the user says goodbye, wants to stop talking, or asks you to close/end the call.",
  name: "voice_end_session",
  owner_module_id: "engenty-copilot",
  parameters: {
    additionalProperties: false,
    properties: {},
    type: "object",
  },
  title: "End voice session",
});

export const VOICE_MUTE_TOOL = createFrontendToolDefinition({
  availability: "enabled",
  description:
    "Mute the user's microphone. Use when the user asks you to mute them or stop listening.",
  name: "voice_mute",
  owner_module_id: "engenty-copilot",
  parameters: {
    additionalProperties: false,
    properties: {},
    type: "object",
  },
  title: "Mute microphone",
});

export const VOICE_UNMUTE_TOOL = createFrontendToolDefinition({
  availability: "enabled",
  description:
    "Unmute the user's microphone. Use when the user asks you to unmute or start listening again.",
  name: "voice_unmute",
  owner_module_id: "engenty-copilot",
  parameters: {
    additionalProperties: false,
    properties: {},
    type: "object",
  },
  title: "Unmute microphone",
});

export const RESOLVE_PENDING_CONFIRMATION_TOOL = createFrontendToolDefinition({
  availability: "enabled",
  description:
    "Approve or reject the action currently awaiting the user's confirmation in the on-screen dialog. Call with approved=true when the user verbally agrees (e.g. yes, go ahead, do it, confirm), or approved=false when they decline (e.g. no, cancel, stop). Set always=true only when the user asks to allow this kind of action for the whole chat (e.g. 'always allow', 'immer erlauben'); otherwise leave it false. Only call this while an action is awaiting confirmation.",
  name: "resolve_pending_confirmation",
  owner_module_id: "engenty-copilot",
  parameters: {
    additionalProperties: false,
    properties: {
      always: {
        description:
          "true to allow this action for the rest of the chat without asking again; false to allow just this once.",
        type: "boolean",
      },
      approved: {
        description: "true to proceed with the action, false to cancel it.",
        type: "boolean",
      },
    },
    required: ["approved"],
    type: "object",
  },
  title: "Resolve pending confirmation",
});

/**
 * All voice session control tool definitions.
 * Pass these to `openAiRealtimeVoiceToolsFromFrontendTools` alongside
 * the regular shell frontend tools.
 */
export const VOICE_SESSION_CONTROL_TOOLS = [
  VOICE_END_SESSION_TOOL,
  VOICE_MUTE_TOOL,
  VOICE_UNMUTE_TOOL,
  RESOLVE_PENDING_CONFIRMATION_TOOL,
] as const;
