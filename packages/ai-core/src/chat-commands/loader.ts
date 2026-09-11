// COMMAND.md loader — scans `modules/<name>/ai/commands/<command>/COMMAND.md`.
// Frontmatter declares the command; the markdown body is the prompt template
// for `prompt`-kind commands (`{input}` interpolates the free text after the
// token). Node-only (fs) — exported from the main entry, never from browser.ts.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "@11ty/gray-matter";
import { z } from "zod";
import {
  type ChatCommandDefinition,
  isValidChatCommandToken,
} from "./contracts.js";

const chatCommandArgSchema = z.object({
  label: z.string().optional(),
  name: z.string(),
  options: z.array(z.string()).optional(),
  ref_entity: z.string().optional(),
  required: z.boolean().optional(),
  type: z.enum(["enum", "ref", "string"]),
});

const commandFileFrontmatterSchema = z.object({
  workflow_id: z.string().optional(),
  agent_ids: z.array(z.string()).optional(),
  args: z.array(chatCommandArgSchema).optional(),
  command: z.string(),
  description: z.string().optional(),
  description_key: z.string().optional(),
  id: z.string().optional(),
  kind: z.enum(["workflow", "prompt"]),
  label: z.string().optional(),
  label_key: z.string().optional(),
  module_id: z.string().optional(),
  order: z.number().optional(),
});

function listCommandMarkdownFiles(commandsDir: string): string[] {
  const entries = readdirSync(commandsDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(commandsDir, entry.name);
    if (entry.isDirectory()) {
      const commandPath = join(path, "COMMAND.md");
      if (existsSync(commandPath)) {
        files.push(commandPath);
      }
    }
  }
  return files.sort();
}

export function loadChatCommandDefinitionsFromDirectory(input: {
  commandsDir: string;
  moduleId: string;
}): ChatCommandDefinition[] {
  if (!existsSync(input.commandsDir)) {
    return [];
  }
  const definitions: ChatCommandDefinition[] = [];
  const seen = new Set<string>();
  for (const filePath of listCommandMarkdownFiles(input.commandsDir)) {
    const parsed = matter(readFileSync(filePath, "utf8"));
    const front = commandFileFrontmatterSchema.parse(parsed.data);
    const command = front.command.trim().toLowerCase();
    if (!isValidChatCommandToken(command)) {
      throw new Error(
        `loadChatCommandDefinitions(${input.moduleId}): "${front.command}" is not a valid slash token (lowercase ASCII letters, digits, dashes)`
      );
    }
    if (seen.has(command)) {
      throw new Error(
        `loadChatCommandDefinitions(${input.moduleId}): duplicate command "/${command}"`
      );
    }
    seen.add(command);
    if (front.kind === "workflow" && !front.workflow_id) {
      throw new Error(
        `loadChatCommandDefinitions(${input.moduleId}): action command "/${command}" needs workflow_id`
      );
    }
    const template = parsed.content.trim();
    if (front.kind === "prompt" && !template) {
      throw new Error(
        `loadChatCommandDefinitions(${input.moduleId}): prompt command "/${command}" needs a template body`
      );
    }
    definitions.push({
      workflow_id: front.workflow_id,
      agent_ids: front.agent_ids,
      args: front.args,
      command,
      description: front.description,
      description_key: front.description_key,
      id: front.id ?? `${input.moduleId}.${command}`,
      kind: front.kind,
      label: front.label,
      label_key: front.label_key,
      module_id: front.module_id ?? input.moduleId,
      order: front.order,
      ...(front.kind === "prompt" ? { template } : {}),
    });
  }
  return definitions;
}
