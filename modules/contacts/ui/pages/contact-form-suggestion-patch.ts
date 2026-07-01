import type { ContactCreateFormValues } from "./contact-form.js";

const ADD_ROLE_PREFIX = "add_role_";
const REMOVE_ROLE_PREFIX = "remove_role_";

function isTruthyPatchValue(value: string | null) {
  return value === "true" || value === "1";
}

function isFormFieldKey(key: string): key is keyof ContactCreateFormValues {
  return key in CONTACT_FORM_FIELD_KEYS;
}

const CONTACT_FORM_FIELD_KEYS: Record<keyof ContactCreateFormValues, true> = {
  address_city: true,
  address_country: true,
  address_info: true,
  address_street: true,
  address_zip: true,
  billing_email: true,
  birth_name: true,
  contact_name: true,
  court_of_registration: true,
  custom_display_name: true,
  display_name: true,
  display_name_override: true,
  email: true,
  first_name: true,
  last_name: true,
  legal_form: true,
  legal_name: true,
  middle_name: true,
  name_prefix: true,
  name_suffix: true,
  notes: true,
  phone: true,
  phonetic_name: true,
  reference_id: true,
  registration_number: true,
  roles: true,
  tax_id: true,
  type: true,
  vat_id: true,
  website_contact: true,
  website_impress: true,
};

export function applySuggestionPatchToContactFormValues(
  values: ContactCreateFormValues,
  patch: Record<string, string | null>
): ContactCreateFormValues {
  const nextRoles = new Set(values.roles);
  const nextValues: ContactCreateFormValues = {
    ...values,
    roles: [...values.roles],
  };

  for (const [key, value] of Object.entries(patch)) {
    if (key.startsWith(ADD_ROLE_PREFIX)) {
      if (isTruthyPatchValue(value)) {
        nextRoles.add(key.slice(ADD_ROLE_PREFIX.length));
      }
      continue;
    }

    if (key.startsWith(REMOVE_ROLE_PREFIX)) {
      if (isTruthyPatchValue(value)) {
        nextRoles.delete(key.slice(REMOVE_ROLE_PREFIX.length));
      }
      continue;
    }

    if (!(key === "roles" || isFormFieldKey(key))) {
      continue;
    }

    if (key === "roles") {
      continue;
    }

    nextValues[key] = value ?? "";
  }

  nextValues.roles = [...nextRoles];
  return nextValues;
}
