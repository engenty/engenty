import { z } from "@hono/zod-openapi";

const contactTypeSchema = z.enum(["organisation", "person"]);

const includeInactiveQuery = z
  .union([z.boolean(), z.literal("true"), z.literal("false")])
  .optional()
  .transform((v) => v === true || v === "true");

const relationDateSchema = z.string().trim().min(1).nullable();

function validateRelationDateRange(
  data: { valid_from?: string | null; valid_to?: string | null },
  ctx: z.RefinementCtx
) {
  if (data.valid_from && data.valid_to && data.valid_from > data.valid_to) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["valid_to"],
      message: "valid_to must be on or after valid_from",
    });
  }
}

export const contactRelationTypeSchema = z.enum([
  "works_at",
  "member_of",
  "client_of",
]);

export const contactRelationRecordSchema = z.object({
  id: z.string(),
  from_contact_id: z.string().min(1),
  to_contact_id: z.string().min(1),
  relation_type: contactRelationTypeSchema,
  label: z.string().nullable(),
  position: z.string().nullable(),
  department: z.string().nullable(),
  role: z.string().nullable(),
  is_primary: z.boolean(),
  valid_from: relationDateSchema,
  valid_to: relationDateSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const contactRelationContactSummarySchema = z.object({
  id: z.string().min(1),
  display_name: z.string().min(1),
  type: contactTypeSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export const contactRelationListItemSchema = contactRelationRecordSchema.extend(
  {
    other_contact: contactRelationContactSummarySchema,
  }
);

export const contactRelationCreateInputSchema = z
  .strictObject({
    from_contact_id: z.string().min(1),
    to_contact_id: z.string().min(1),
    relation_type: contactRelationTypeSchema,
    label: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    is_primary: z.boolean().optional(),
    valid_from: relationDateSchema.optional(),
    valid_to: relationDateSchema.optional(),
  })
  .superRefine(validateRelationDateRange);

export const contactRelationUpdateSchema = z
  .strictObject({
    label: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    is_primary: z.boolean().optional(),
    valid_from: relationDateSchema.optional(),
    valid_to: relationDateSchema.optional(),
  })
  .superRefine(validateRelationDateRange);

export const contactRelationIdParamsSchema = z.object({
  relationId: z.string().min(1),
});

export const contactRelationsListQuerySchema = z.object({
  include_inactive: includeInactiveQuery,
});

export type ContactRelationType = z.infer<typeof contactRelationTypeSchema>;
export type ContactRelationRecord = z.infer<typeof contactRelationRecordSchema>;
export type ContactRelationContactSummary = z.infer<
  typeof contactRelationContactSummarySchema
>;
export type ContactRelationListItem = z.infer<
  typeof contactRelationListItemSchema
>;
export type ContactRelationCreateInput = z.infer<
  typeof contactRelationCreateInputSchema
>;
export type ContactRelationUpdateInput = z.infer<
  typeof contactRelationUpdateSchema
>;
export type ContactRelationsListQuery = z.infer<
  typeof contactRelationsListQuerySchema
>;

export interface ContactRelationParticipant {
  id: string;
  type: "organisation" | "person";
}

function parseRelationDate(
  value: string | null | undefined,
  boundary: "end" | "start"
): number | null {
  if (!value) {
    return null;
  }
  const parsed = value.includes("T")
    ? new Date(value)
    : new Date(
        boundary === "end" ? `${value}T23:59:59.999Z` : `${value}T00:00:00Z`
      );
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

/**
 * V1 product behavior is current-state only, but the relation contract keeps
 * `valid_from` / `valid_to` so the same edge records can back future history
 * and graph views without reshaping the relation model again.
 */
export function isCurrentContactRelation(
  relation: Pick<ContactRelationRecord, "valid_from" | "valid_to">,
  now = new Date()
) {
  const nowTime = now.getTime();
  const validFrom = parseRelationDate(relation.valid_from, "start");
  const validTo = parseRelationDate(relation.valid_to, "end");
  if (validFrom !== null && validFrom > nowTime) {
    return false;
  }
  if (validTo !== null && validTo < nowTime) {
    return false;
  }
  return true;
}

export function normalizeContactRelationParticipants<
  T extends Pick<
    ContactRelationCreateInput,
    "from_contact_id" | "to_contact_id" | "relation_type"
  >,
>(
  input: T,
  fromContact: ContactRelationParticipant,
  toContact: ContactRelationParticipant
) {
  if (
    input.relation_type === "works_at" &&
    fromContact.type === "organisation" &&
    toContact.type === "person"
  ) {
    return {
      input: {
        ...input,
        from_contact_id: input.to_contact_id,
        to_contact_id: input.from_contact_id,
      },
      fromContact: toContact,
      toContact: fromContact,
    };
  }

  return { input, fromContact, toContact };
}

export function validateContactRelationParticipants(input: {
  fromContact: ContactRelationParticipant;
  relation_type: ContactRelationType;
  toContact: ContactRelationParticipant;
}) {
  if (input.fromContact.id === input.toContact.id) {
    return "A contact cannot be related to itself";
  }

  if (
    input.relation_type === "works_at" &&
    !(
      input.fromContact.type === "person" &&
      input.toContact.type === "organisation"
    )
  ) {
    return "works_at relations must link a person to an organisation";
  }

  return null;
}

export function getPrimaryContactIdForRelation(
  relation: Pick<
    ContactRelationRecord,
    "from_contact_id" | "relation_type" | "to_contact_id"
  >
) {
  if (relation.relation_type === "works_at") {
    return relation.from_contact_id;
  }

  return null;
}
