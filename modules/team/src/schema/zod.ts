import { z } from "@hono/zod-openapi";
import { isProfileNameWriteValid } from "../services/profile-name.js";

const nullableNamePartSchema = z.string().nullable().optional();

export const profileNamePartsSchema = z.object({
  name_prefix: nullableNamePartSchema,
  first_name: nullableNamePartSchema,
  middle_name: nullableNamePartSchema,
  last_name: nullableNamePartSchema,
  name_suffix: nullableNamePartSchema,
  phonetic_name: nullableNamePartSchema,
  birth_name: nullableNamePartSchema,
  full_name_override: nullableNamePartSchema,
});

const PROFILE_NAME_WRITE_KEYS = [
  "name_prefix",
  "first_name",
  "middle_name",
  "last_name",
  "name_suffix",
  "phonetic_name",
  "birth_name",
  "full_name_override",
  "full_name",
] as const;

function refineProfileName(
  data: z.infer<typeof profileNamePartsSchema> & { full_name?: string },
  ctx: z.RefinementCtx
) {
  const touchesName = PROFILE_NAME_WRITE_KEYS.some(
    (key) => key in data && data[key as keyof typeof data] !== undefined
  );
  if (!touchesName) {
    return;
  }
  if (!isProfileNameWriteValid(data)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Last name or display name is required",
      path: ["last_name"],
    });
  }
}

export const memberTypeSchema = z.enum(["internal", "external", "contractor"]);

export const teamMemberSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  scope_id: z.string(),
  user_id: z.string().uuid().nullable(),
  member_type: memberTypeSchema,
  full_name: z.string().min(1),
  name_prefix: z.string().nullable(),
  first_name: z.string().nullable(),
  middle_name: z.string().nullable(),
  last_name: z.string().nullable(),
  name_suffix: z.string().nullable(),
  phonetic_name: z.string().nullable(),
  birth_name: z.string().nullable(),
  full_name_override: z.string().nullable(),
  initials: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  position: z.string().nullable(),
  department: z.string().nullable(),
  location: z.string().nullable(),
  profile_image_storage_key: z.string().nullable(),
  import_id: z.string().nullable(),
  last_imported_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  role_term_id: z.string().uuid().nullable().optional(),
  location_term_id: z.string().uuid().nullable().optional(),
  role_term: z.string().nullable().optional(),
  location_term: z.string().nullable().optional(),
  org_node_id: z.string().nullable().optional(),
  reports_to_id: z.string().nullable().optional(),
  reports_to_display_name: z.string().nullable().optional(),
});

const inviteRoleSchema = z.enum(["admin", "member"]);

const teamMemberInputSchemaBase = teamMemberSchema
  .omit({
    id: true,
    tenant_id: true,
    scope_id: true,
    created_at: true,
    updated_at: true,
    full_name: true,
    name_prefix: true,
    first_name: true,
    middle_name: true,
    last_name: true,
    name_suffix: true,
    phonetic_name: true,
    birth_name: true,
    full_name_override: true,
  })
  .extend({
    ...profileNamePartsSchema.shape,
    full_name: z.string().min(1).optional(),
    member_type: memberTypeSchema.optional(),
    email: z.string().nullable().optional(),
    invite_email: z.string().email().optional(),
    invite_password: z.string().min(1).optional(),
    invite_role: inviteRoleSchema.optional(),
    role_term_id: z.union([z.string().uuid(), z.literal("")]).optional(),
    location_term_id: z.union([z.string().uuid(), z.literal("")]).optional(),
    profile_image_storage_key: z.string().nullable().optional(),
    import_id: z.string().nullable().optional(),
    last_imported_at: z.string().nullable().optional(),
  });

export const teamMemberInputSchema = teamMemberInputSchemaBase
  .superRefine(refineProfileName)
  .refine(
    (data) =>
      !data.invite_email ||
      (data.invite_password && data.invite_password.length >= 6),
    {
      message:
        "Password is required when creating a user account (min 6 characters)",
      path: ["invite_password"],
    }
  );

/** Lenient create schema for gateway/test-data: structured name or legacy full_name. */
export const teamMemberCreateInputSchema = z
  .strictObject({
    full_name: z.string().min(1).optional(),
    name_prefix: nullableNamePartSchema,
    first_name: nullableNamePartSchema,
    middle_name: nullableNamePartSchema,
    last_name: nullableNamePartSchema,
    name_suffix: nullableNamePartSchema,
    phonetic_name: nullableNamePartSchema,
    birth_name: nullableNamePartSchema,
    full_name_override: nullableNamePartSchema,
    initials: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    member_type: memberTypeSchema.optional(),
    user_id: z.string().uuid().nullable().optional(),
    invite_email: z.string().email().optional(),
    invite_password: z.string().min(1).optional(),
    invite_role: inviteRoleSchema.optional(),
    role_term_id: z.string().uuid().optional(),
  })
  .superRefine(refineProfileName)
  .refine(
    (data) =>
      !data.invite_email ||
      (data.invite_password && data.invite_password.length >= 6),
    {
      message:
        "Password is required when creating a user account (min 6 characters)",
      path: ["invite_password"],
    }
  );

export const teamMemberUpdateSchema = teamMemberInputSchemaBase
  .partial()
  .superRefine(refineProfileName)
  .refine(
    (data) =>
      !data.invite_email ||
      (data.invite_password && data.invite_password.length >= 6),
    {
      message:
        "Password is required when creating a user account (min 6 characters)",
      path: ["invite_password"],
    }
  );

export const teamMemberIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const notFoundSchema = z.object({
  error: z.string(),
});

export const deleteTeamMemberResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});

export const teamMembersListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(1000).optional(),
  sortBy: z
    .enum(["full_name", "position", "department", "created_at"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  search: z.string().optional(),
  role_term_id: z.string().uuid().optional(),
  location_term_id: z.string().uuid().optional(),
  group_id: z.string().optional(),
});

export const teamMembersPaginatedResponseSchema = z.object({
  data: z.array(teamMemberSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

/** Minimal team row for time-tracking catalog (via `team.time-tracking.listCatalog`). */
export const timeTrackingCatalogRowSchema = z.object({
  id: z.string(),
  full_name: z.string(),
  user_id: z.string().nullable(),
});

export const timeTrackingListCatalogInputSchema = z.strictObject({});

export const timeTrackingListCatalogOutputSchema = z.array(
  timeTrackingCatalogRowSchema
);

export const timeTrackingActorInputSchema = z.object({
  principal_id: z.string().min(1),
});

export const timeTrackingActorOutputSchema = z
  .object({
    id: z.string(),
    full_name: z.string(),
  })
  .nullable();

export const teamByImportIdQuerySchema = z.object({
  import_id: z.string().min(1),
});

export const teamByEmailQuerySchema = z.object({
  email: z.string().min(1),
});
