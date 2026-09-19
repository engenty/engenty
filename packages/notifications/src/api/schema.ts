import { z } from "zod";

export const notificationClassSchema = z.enum([
  "decision",
  "alert",
  "todo",
  "update",
]);

export const notificationPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "urgent",
]);

export const listNotificationsQuerySchema = z.object({
  actor: z.string().min(1).max(256).optional(),
  class: notificationClassSchema.optional(),
  kind: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  priority: notificationPrioritySchema.optional(),
  scope: z.enum(["space", "tenant"]).optional(),
  source: z.string().min(1).max(128).optional(),
  status: z.enum(["open", "all"]).optional(),
  stream: z.string().min(1).max(128).optional(),
  subject_id: z.string().min(1).max(256).optional(),
  subject_type: z.string().min(1).max(64).optional(),
});

export const notificationRecordSchema = z.object({
  actor_id: z.string().nullable(),
  actor_kind: z.enum(["agent", "user", "system"]).nullable(),
  audience_id: z.string().nullable(),
  audience_kind: z.enum(["tenant", "user", "stream", "space"]),
  class: notificationClassSchema,
  coalesced_count: z.number(),
  created_at: z.string(),
  dismissed_at: z.string().nullable(),
  id: z.string(),
  kind: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  payload: z.record(z.string(), z.unknown()).nullable(),
  priority: notificationPrioritySchema,
  resolved_at: z.string().nullable(),
  /** The caller's own: whether they looked at this row. */
  seen: z.boolean(),
  source: z.string(),
  space_id: z.string().nullable(),
  status: z.enum(["pending", "dismissed", "resolved"]),
  subject_id: z.string().nullable(),
  subject_type: z.string().nullable(),
  summary: z.string(),
  tenant_id: z.string(),
  updated_at: z.string(),
});

export const listNotificationsResponseSchema = z.object({
  notifications: z.array(notificationRecordSchema),
});

export const unseenCountResponseSchema = z.object({
  in_space: z.number().nullable(),
  total: z.number(),
});

export const okResponseSchema = z.object({ ok: z.literal(true) });

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    auth: z.string().min(1).max(512),
    p256dh: z.string().min(1).max(512),
  }),
  user_agent: z.string().max(512).optional(),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export const pushConfigResponseSchema = z.object({
  publicKey: z.string().nullable(),
});

export const streamCreateSchema = z.object({
  description: z.string().max(1000).nullable().optional(),
  /** Partition suffix; what an Engenty names in `notify({ stream_key })`. */
  key: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,63}$/)
    .describe("kebab-case, e.g. support-escalations"),
  name: z.string().min(1).max(120),
  space_id: z.string().uuid().nullable().optional(),
});

export const streamUpdateSchema = z.object({
  description: z.string().max(1000).nullable().optional(),
  name: z.string().min(1).max(120).optional(),
  space_id: z.string().uuid().nullable().optional(),
});

export const streamRouteSchema = z.object({
  channel: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
  min_priority: notificationPrioritySchema.default("low"),
  target: z.record(z.string(), z.unknown()).default({}),
});

export const streamRoutesSchema = z.object({
  routes: z.array(streamRouteSchema).max(20),
});
