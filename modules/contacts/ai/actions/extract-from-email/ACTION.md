---
id: contacts.extract-from-email
agent_id: contacts.manager
name: Extract contact from email
description: Extract a person and company from an email, check for duplicates, and propose linking steps.
default_thread_mode: new
skills: contacts-extract-email
allowed-tools: extractContactFromEmail engenty_tools_search engenty_tools_discover engenty_tool_execute createContact createContactRelation
input_schema_json:
  description: Email text and optional sender hints for person/company extraction.
  type: object
  additionalProperties: false
  properties:
    email_body:
      description: Full message body to parse for contacts and companies.
      type: string
      minLength: 1
    from_email:
      description: Sender email when known (helps match existing people).
      type: string
      format: email
    from_name:
      description: Sender display name when known.
      type: string
      minLength: 1
    create_missing_records:
      description: When true, the agent may create missing records after duplicate checks.
      type: boolean
      default: false
  required:
    - email_body
---

# Extract Contact From Email

## Task

Extract one person/company proposal from one email body.

## Steps

1. Call `extractContactFromEmail` with `{ "email_body": "<email text>", "from_email": "<optional>", "from_name": "<optional>" }`.
2. Inspect the returned `person`, `company`, `existing_person_matches`, `existing_company_matches`, and `proposed_relation`.
3. If duplicates already exist, stop and present the existing matches before proposing creation.
4. If the workflow explicitly allows record creation, call `createContact` for the missing person and/or company.
5. If both entities should be linked, call `createContactRelation` with `{ "from_contact_id": "<person-id>", "to_contact_id": "<company-id>", "relation_type": "works_at", "role": "<optional>" }`.
6. Summarize the extracted result and any duplicate or linking decisions.

## Rules

- Handle one email extraction task at a time.
- Search for duplicates before proposing creation.
- Do not guess links when the entity match is ambiguous.
