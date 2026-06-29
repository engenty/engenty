/**
 * Shared fixtures: DB CHECK, TS validators, and API layers must agree.
 * @see AGENT_SKILL_NAME_POSTGRES_PATTERN in ../skill-name.ts
 */

export const VALID_AGENT_SKILL_NAME_FIXTURES = [
  "a",
  "0",
  "z9",
  "contacts-extract-email",
  "engenty-safe-automation",
  "a-b",
  "a--b",
  "x".repeat(64),
] as const;

export const INVALID_AGENT_SKILL_NAME_FIXTURES = [
  "",
  " ",
  "contacts_search",
  "Bad",
  "contacts extract",
  "-x",
  "x-",
  "--",
  "-",
  "a".repeat(65),
  "café",
  "skill_name",
  "\tfoo",
  "foo\n",
] as const;
