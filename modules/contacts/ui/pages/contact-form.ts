import { z } from "zod";
import {
  formatDisplayName,
  isContactNameWriteValid,
} from "../../src/services/contact-name.js";
import type {
  ContactCreateInput,
  ContactListItem,
  ContactUpdateInput,
} from "../api.js";
import {
  contactProfileNameFormFieldsFromContact,
  contactProfileNameFormFieldsSchema,
  contactProfileNamePayloadFromForm,
  emptyContactProfileNameFormFields,
} from "../lib/contact-profile-name-form.js";

interface ValidationMessages {
  invalidEmail: string;
  required: string;
}

/** Email valid when empty or valid format (contact name and email are optional for entities). */
const optionalEmailSchema = (invalidMessage: string) =>
  z
    .string()
    .refine(
      (v) => v.trim() === "" || z.string().email().safeParse(v.trim()).success,
      { message: invalidMessage }
    );

const contactFormBaseSchema = z.object({
  contact_name: z.string(),
  email: optionalEmailSchema(""),
  billing_email: optionalEmailSchema(""),
  phone: z.string(),
  reference_id: z.string(),
  address_street: z.string(),
  address_info: z.string(),
  address_zip: z.string(),
  address_city: z.string(),
  address_country: z.string(),
  vat_id: z.string(),
  tax_id: z.string(),
  registration_number: z.string(),
  court_of_registration: z.string(),
  legal_form: z.string(),
  website_contact: z.string(),
  website_impress: z.string(),
  notes: z.string(),
  roles: z.array(z.string()),
  type: z.enum(["organisation", "person"]),
  display_name: z.string(),
  legal_name: z.string(),
});

export function createContactCreateFormSchema(messages: ValidationMessages) {
  const emailSchema = optionalEmailSchema(messages.invalidEmail);
  return contactFormBaseSchema
    .extend({
      email: emailSchema,
      billing_email: emailSchema,
    })
    .and(contactProfileNameFormFieldsSchema)
    .superRefine((data, ctx) => {
      if (data.type === "organisation") {
        if (!data.legal_name?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["legal_name"],
            message: messages.required,
          });
        }
        if (!(data.display_name?.trim() || data.legal_name?.trim())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["display_name"],
            message: messages.required,
          });
        }
      } else if (data.type === "person") {
        const valid = isContactNameWriteValid({
          name_prefix: data.name_prefix,
          first_name: data.first_name,
          middle_name: data.middle_name,
          last_name: data.last_name,
          name_suffix: data.name_suffix,
          phonetic_name: data.phonetic_name,
          birth_name: data.birth_name,
          display_name_override: data.custom_display_name
            ? data.display_name_override
            : null,
        });
        if (!valid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.required,
            path: ["last_name"],
          });
        }
      }
    });
}

export type ContactCreateFormValues = z.infer<typeof contactFormBaseSchema> &
  z.infer<typeof contactProfileNameFormFieldsSchema>;

export const emptyForm: ContactCreateFormValues = {
  ...emptyContactProfileNameFormFields,
  display_name: "",
  legal_name: "",
  contact_name: "",
  email: "",
  billing_email: "",
  phone: "",
  reference_id: "",
  address_street: "",
  address_info: "",
  address_zip: "",
  address_city: "",
  address_country: "",
  vat_id: "",
  tax_id: "",
  registration_number: "",
  court_of_registration: "",
  legal_form: "",
  website_contact: "",
  website_impress: "",
  notes: "",
  roles: [],
  type: "organisation",
};

export function entityToFormValues(
  entity: ContactListItem
): ContactCreateFormValues {
  const base: ContactCreateFormValues = {
    ...emptyForm,
    display_name: entity.display_name,
    legal_name: entity.legal_name ?? "",
    contact_name: entity.contact_name ?? "",
    email: entity.email ?? "",
    billing_email: (() => {
      const e = (entity.email ?? "").trim();
      const b = (entity.billing_email ?? "").trim();
      if (e && b && e === b) {
        return "";
      }
      return entity.billing_email ?? "";
    })(),
    phone: entity.phone ?? "",
    reference_id: entity.reference_id ?? "",
    address_street: entity.address_street ?? "",
    address_info: entity.address_info ?? "",
    address_zip: entity.address_zip ?? "",
    address_city: entity.address_city ?? "",
    address_country: entity.address_country ?? "",
    vat_id: entity.vat_id ?? "",
    tax_id: entity.tax_id ?? "",
    registration_number: entity.registration_number ?? "",
    court_of_registration: entity.court_of_registration ?? "",
    legal_form: entity.legal_form ?? "",
    website_contact: entity.website_contact ?? "",
    website_impress: entity.website_impress ?? "",
    notes: entity.notes ?? "",
    roles: entity.roles ?? [],
    type: entity.type,
  };
  if (entity.type === "person") {
    return {
      ...base,
      ...contactProfileNameFormFieldsFromContact(entity),
    };
  }
  return base;
}

export const defaultContactCreateFormValues: ContactCreateFormValues = {
  ...emptyForm,
};

export function formValuesToCreateInput(
  values: ContactCreateFormValues
): ContactCreateInput {
  if (values.type === "person") {
    const namePayload = contactProfileNamePayloadFromForm(values);
    const structured = formatDisplayName(namePayload.parts);
    return {
      type: "person",
      ...namePayload.parts,
      display_name: namePayload.display_name,
      legal_name: structured || null,
      contact_name: values.contact_name.trim(),
      email: values.email.trim() || null,
      billing_email: (() => {
        const e = values.email.trim();
        const b = values.billing_email.trim();
        if (!b) {
          return null;
        }
        if (e && b === e) {
          return null;
        }
        return b;
      })(),
      phone: values.phone.trim() || null,
      reference_id: values.reference_id.trim() || null,
      address_street: values.address_street.trim() || null,
      address_info: values.address_info.trim() || null,
      address_zip: values.address_zip.trim() || null,
      address_city: values.address_city.trim() || null,
      address_country: values.address_country.trim() || null,
      vat_id: values.vat_id.trim() || null,
      tax_id: values.tax_id.trim() || null,
      registration_number: values.registration_number.trim() || null,
      court_of_registration: values.court_of_registration.trim() || null,
      legal_form: values.legal_form.trim() || null,
      website_contact: values.website_contact.trim() || null,
      website_impress: values.website_impress.trim() || null,
      notes: values.notes.trim() || null,
      created_by: null,
    };
  }

  const displayName = values.display_name.trim()
    ? values.display_name.trim()
    : values.legal_name.trim();
  return {
    type: "organisation",
    display_name: displayName || values.legal_name.trim(),
    legal_name: values.legal_name.trim() || null,
    contact_name: values.contact_name.trim(),
    name_prefix: null,
    first_name: null,
    middle_name: null,
    last_name: null,
    name_suffix: null,
    phonetic_name: null,
    birth_name: null,
    display_name_override: null,
    email: values.email.trim() || null,
    billing_email: (() => {
      const e = values.email.trim();
      const b = values.billing_email.trim();
      if (!b) {
        return null;
      }
      if (e && b === e) {
        return null;
      }
      return b;
    })(),
    phone: values.phone.trim() || null,
    reference_id: values.reference_id.trim() || null,
    address_street: values.address_street.trim() || null,
    address_info: values.address_info.trim() || null,
    address_zip: values.address_zip.trim() || null,
    address_city: values.address_city.trim() || null,
    address_country: values.address_country.trim() || null,
    vat_id: values.vat_id.trim() || null,
    tax_id: values.tax_id.trim() || null,
    registration_number: values.registration_number.trim() || null,
    court_of_registration: values.court_of_registration.trim() || null,
    legal_form: values.legal_form.trim() || null,
    website_contact: values.website_contact.trim() || null,
    website_impress: values.website_impress.trim() || null,
    notes: values.notes.trim() || null,
    created_by: null,
  };
}

export function formValuesToPatch(
  values: ContactCreateFormValues
): ContactUpdateInput {
  return {
    ...formValuesToCreateInput(values),
    contact_name: values.contact_name.trim(),
  };
}
