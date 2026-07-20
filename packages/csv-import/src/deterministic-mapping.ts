import type { ColumnMapping, ImportFieldDefinition } from "./types.js";

export function applyDeterministicMapping(
  csvHeaders: string[],
  fields: ImportFieldDefinition[]
): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];
  const usedColumnIndices = new Set<number>();

  for (const field of fields) {
    const matchIndex = findMatch(csvHeaders, field, usedColumnIndices);
    if (matchIndex !== -1) {
      usedColumnIndices.add(matchIndex);
      mappings.push({
        fieldKey: field.key,
        csvColumn: csvHeaders[matchIndex],
        csvColumnIndex: matchIndex,
        mappingSource: "deterministic",
      });
    }
  }

  return mappings;
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[_\s-]/g, "")
    .replace(/ß/g, "ss");
}

function addVariants(variants: Set<string>, ...values: string[]): void {
  for (const value of values) {
    const normalized = normalizeHeader(value);
    if (normalized) {
      variants.add(normalized);
    }
  }
}

function buildFieldVariants(field: ImportFieldDefinition): Set<string> {
  const variants = new Set<string>();
  addVariants(variants, field.key, field.label);

  switch (field.key) {
    case "first_name":
      addVariants(
        variants,
        "firstname",
        "givenname",
        "vorname",
        "prenom",
        "forename"
      );
      break;
    case "middle_name":
      addVariants(variants, "middlename", "secondname", "mittelname");
      break;
    case "last_name":
      addVariants(
        variants,
        "lastname",
        "surname",
        "familyname",
        "nachname",
        "familienname"
      );
      break;
    case "name_prefix":
      addVariants(
        variants,
        "nameprefix",
        "titleprefix",
        "prefix",
        "title",
        "nametitle",
        "titelvorangestellt",
        "anrede"
      );
      break;
    case "name_suffix":
      addVariants(
        variants,
        "namesuffix",
        "titlesuffix",
        "suffix",
        "namensuffix",
        "titelnachgestellt"
      );
      break;
    case "phonetic_name":
      addVariants(variants, "phoneticname", "phonetisch", "phonetic");
      break;
    case "birth_name":
      addVariants(variants, "birthname", "maidenname", "geburtsname");
      break;
    case "full_name":
      addVariants(
        variants,
        "fullname",
        "name",
        "displayname",
        "mitarbeiter",
        "employee",
        "person"
      );
      break;
    case "display_name":
      addVariants(
        variants,
        "displayname",
        "company",
        "firma",
        "organisation",
        "unternehmen"
      );
      break;
    case "legal_name":
      addVariants(
        variants,
        "legalname",
        "officialname",
        "registeredname",
        "firmenname",
        "unternehmen"
      );
      break;
    case "contact_name":
      addVariants(
        variants,
        "contactname",
        "contact",
        "kontakt",
        "ansprechpartner"
      );
      break;
    case "email":
    case "billing_email":
      addVariants(variants, "email", "mail", "emailaddress");
      break;
    case "phone":
      addVariants(variants, "phone", "tel", "telefon", "telephone");
      break;
    case "role_term":
      addVariants(variants, "role", "rolle", "funktion", "teamrole");
      break;
    case "location_term":
      addVariants(
        variants,
        "locationterm",
        "standort",
        "office",
        "site",
        "buero",
        "buro"
      );
      break;
    case "location":
      addVariants(variants, "location", "ort");
      break;
    case "import_id":
      addVariants(variants, "importid", "externalid");
      break;
    case "reference_id":
      addVariants(variants, "referenceid", "kundennummer", "referenz");
      break;
    case "employee_number":
      addVariants(variants, "employeenumber", "personalnummer", "pnr");
      break;
    case "job_title":
      addVariants(variants, "jobtitle", "berufsbezeichnung", "positiontitle");
      break;
    case "department":
      addVariants(variants, "department", "abteilung");
      break;
    case "address_street":
      addVariants(variants, "street", "strasse", "address", "adresse");
      break;
    case "address_city":
      addVariants(variants, "city", "stadt", "ort");
      break;
    case "address_zip":
      addVariants(variants, "zip", "postal", "plz", "postcode");
      break;
    case "address_country":
      addVariants(variants, "country", "land");
      break;
    default:
      if (field.key.includes("email")) {
        addVariants(variants, "email", "mail");
      }
      if (field.key.includes("phone")) {
        addVariants(variants, "phone", "tel", "telefon");
      }
      if (field.key.includes("company")) {
        addVariants(variants, "company", "firma", "unternehmen");
      }
      if (field.key.includes("address")) {
        addVariants(variants, "address", "adresse");
      }
      if (field.key.includes("import") && field.key.includes("id")) {
        addVariants(variants, "importid", "externalid", "kundennummer");
      }
      break;
  }

  return variants;
}

function findMatch(
  headers: string[],
  field: ImportFieldDefinition,
  usedColumnIndices: Set<number>
): number {
  const variants = buildFieldVariants(field);

  for (let index = 0; index < headers.length; index++) {
    if (usedColumnIndices.has(index)) {
      continue;
    }
    const normalized = normalizeHeader(headers[index] ?? "");
    if (variants.has(normalized)) {
      return index;
    }
  }

  return -1;
}
