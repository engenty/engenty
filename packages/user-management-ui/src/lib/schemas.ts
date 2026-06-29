import { z } from "zod";

export const userSchema = z.object({
  id: z.string(),
  display_name: z.string().default(""),
  role: z.union([z.literal("admin"), z.literal("member")]).default("member"),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  initials: z.string().nullable().optional(),
});

export type UserRecord = z.infer<typeof userSchema>;

export const inviteUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  display_name: z.string().min(1),
  role: z.union([z.literal("admin"), z.literal("member")]).default("member"),
  phone: z.string().optional(),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const updateUserProfileSchema = z.object({
  display_name: z.string().min(1).optional(),
  initials: z.string().optional(),
  phone: z.string().optional(),
  role: z.union([z.literal("admin"), z.literal("member")]).optional(),
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
