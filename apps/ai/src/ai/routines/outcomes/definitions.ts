import type { OutcomeProviderDefinition } from "@engenty/ai-core";
import {
  AGENT_MESSAGE_PROVIDER_ID,
  ARTIFACT_POINTER_PROVIDER_ID,
  DESK_CHAT_PROVIDER_ID,
  EMAIL_PROVIDER_ID,
  NOTIFICATION_HIGH_PROVIDER_ID,
  NOTIFICATION_UPDATE_PROVIDER_ID,
  WEBHOOK_PROVIDER_ID,
} from "./ids.js";

const EMPTY_OBJECT: Record<string, unknown> = {
  additionalProperties: false,
  properties: {},
  type: "object",
};

const OPTIONAL_PROSE: Record<string, unknown> = {
  additionalProperties: false,
  properties: {
    body: { type: "string" },
    summary: { type: "string" },
  },
  type: "object",
};

export const BUILTIN_OUTCOME_PROVIDERS: OutcomeProviderDefinition[] = [
  {
    configSchema: EMPTY_OBJECT,
    description:
      "Post the run's result into the owner's desk chat with this Engenty.",
    id: DESK_CHAT_PROVIDER_ID,
    label: "Desk chat",
    moduleId: "ai",
    payloadSchema: OPTIONAL_PROSE,
  },
  {
    configSchema: {
      additionalProperties: false,
      properties: {
        agent_id: {
          description: "Mounted Engenty that should receive the hand-off",
          minLength: 1,
          type: "string",
        },
      },
      required: ["agent_id"],
      type: "object",
    },
    description: "Hand the result to another mounted Engenty on this Space.",
    id: AGENT_MESSAGE_PROVIDER_ID,
    label: "Agent message",
    moduleId: "ai",
    payloadSchema: OPTIONAL_PROSE,
  },
  {
    configSchema: EMPTY_OBJECT,
    description:
      "Write an update in the Space inbox. Does not count on the bell.",
    id: NOTIFICATION_UPDATE_PROVIDER_ID,
    label: "Inbox update",
    moduleId: "ai",
    payloadSchema: OPTIONAL_PROSE,
  },
  {
    configSchema: EMPTY_OBJECT,
    description:
      "Write a high-priority update in the Space inbox and on the dashboard card. Counts on the bell.",
    id: NOTIFICATION_HIGH_PROVIDER_ID,
    label: "High-priority update",
    moduleId: "ai",
    payloadSchema: OPTIONAL_PROSE,
  },
  {
    configSchema: {
      additionalProperties: false,
      properties: {
        to: {
          description: "Recipient address",
          minLength: 3,
          type: "string",
        },
      },
      required: ["to"],
      type: "object",
    },
    description:
      "Send now through the tenant Gmail connection. Not the delayed unread-mail path.",
    id: EMAIL_PROVIDER_ID,
    label: "Email",
    moduleId: "ai",
    payloadSchema: {
      additionalProperties: false,
      properties: {
        body: { type: "string" },
        subject: { type: "string" },
      },
      type: "object",
    },
  },
  {
    configSchema: {
      additionalProperties: false,
      properties: {
        location: {
          description: "Optional label for where the artifact lives",
          type: "string",
        },
      },
      type: "object",
    },
    description:
      "Record the artifact this run already produced so other outcomes and the desk can name it.",
    id: ARTIFACT_POINTER_PROVIDER_ID,
    label: "Artifact pointer",
    moduleId: "ai",
    payloadSchema: {
      additionalProperties: false,
      properties: {
        artifact_id: { type: "string" },
        title: { type: "string" },
      },
      type: "object",
    },
  },
  {
    configSchema: {
      additionalProperties: false,
      properties: {
        secret: {
          description: "Optional secret sent as X-Engenty-Webhook-Secret",
          type: "string",
        },
        url: { type: "string" },
      },
      required: ["url"],
      type: "object",
    },
    description:
      "HTTP POST of the envelope and payload to a URL you configure.",
    id: WEBHOOK_PROVIDER_ID,
    label: "Webhook",
    moduleId: "ai",
    payloadSchema: { additionalProperties: true, type: "object" },
  },
];
