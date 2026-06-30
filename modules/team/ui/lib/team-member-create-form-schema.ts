import { z } from "zod";
import { teamProfileNameFormFieldsSchema } from "./team-profile-name-form.js";

export const memberTypeSchema = z.enum(["internal", "external", "contractor"]);
export const inviteRoleSchema = z.enum(["admin", "member"]);

export const teamMemberCreateFormSchema = z
  .object({
    member_type: memberTypeSchema,
    connect_user_id: z.string(),
    email: z.string(),
    password: z.string().min(6).optional().or(z.literal("")),
    invite_role: inviteRoleSchema.optional(),
  })
  .and(teamProfileNameFormFieldsSchema)
  .refine(
    (data) =>
      data.connect_user_id !== "create_new" || data.email.trim().length > 0,
    {
      message: "Email is required when creating a user account",
      path: ["email"],
    }
  )
  .refine(
    (data) =>
      data.connect_user_id !== "create_new" ||
      (data.password && data.password.length >= 6),
    {
      message:
        "Password is required when creating a user account (min 6 characters)",
      path: ["password"],
    }
  );

export type TeamMemberCreateFormValues = z.infer<
  typeof teamMemberCreateFormSchema
>;

export const teamMemberCreateFormDefaults: TeamMemberCreateFormValues = {
  name_prefix: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  name_suffix: "",
  phonetic_name: "",
  birth_name: "",
  custom_display_name: false,
  full_name_override: "",
  member_type: "internal",
  connect_user_id: "create_new",
  email: "",
  password: "",
  invite_role: "member",
};
