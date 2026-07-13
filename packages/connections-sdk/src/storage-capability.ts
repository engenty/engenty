import { z } from "zod";
import type {
  ConnectorAction,
  ConnectorStorageCapability,
  ConnectorStorageWriteInput,
} from "./types.js";

/**
 * Synthesize the write actions for a connector's storage capability, the
 * counterpart of `filesCapabilityActions`. `files_write`/`files_move` are
 * `group: "write"` and `files_delete` is `group: "destructive"`, so the
 * projected gateway operations inherit the ask-by-default policy, approval
 * flow, and audit with no extra code. Refs share the read capability's
 * semantics (provider-relative to the connection root).
 */
export function storageCapabilityActions(
  storage: ConnectorStorageCapability,
  providerScopes?: string[]
): ConnectorAction[] {
  const scopes = providerScopes ?? [];

  const writeAction: ConnectorAction = {
    description:
      "Write (create or overwrite) a file. Pass folder_ref: null for the connection root. Provide the content as content_text for text or content_base64 for binary — exactly one of the two.",
    group: "write",
    id: "files_write",
    inputSchema: z.object({
      content_base64: z
        .string()
        .optional()
        .describe("Base64-encoded file bytes (binary content)."),
      content_text: z
        .string()
        .optional()
        .describe("UTF-8 text content (text files)."),
      folder_ref: z
        .string()
        .nullable()
        .describe("Folder to write into; null targets the connection root."),
      mime_type: z
        .string()
        .nullish()
        .describe("Content type; inferred from the name when omitted."),
      name: z.string().min(1).max(512).describe("File name."),
    }),
    providerScopes: scopes,
    summary: "Write a file",
    handler: (input, ctx) => {
      const write = input as ConnectorStorageWriteInput;
      const hasText = typeof write.content_text === "string";
      const hasBase64 = typeof write.content_base64 === "string";
      if (hasText === hasBase64) {
        throw new Error(
          "files_write: provide exactly one of content_text or content_base64"
        );
      }
      return storage.write(ctx, write);
    },
  };

  const deleteAction: ConnectorAction = {
    description:
      "Permanently delete a file from the connected storage. This cannot be undone.",
    group: "destructive",
    id: "files_delete",
    inputSchema: z.object({
      ref: z.string().min(1).describe("File ref to delete (an entry's ref)."),
    }),
    providerScopes: scopes,
    summary: "Delete a file",
    handler: (input, ctx) => storage.delete(ctx, input as { ref: string }),
  };

  const actions = [writeAction, deleteAction];

  if (storage.move) {
    const move = storage.move.bind(storage);
    actions.push({
      description:
        "Move (or rename) a file to another folder. Pass to_folder_ref: null for the connection root.",
      group: "write",
      id: "files_move",
      inputSchema: z.object({
        new_name: z
          .string()
          .min(1)
          .max(512)
          .optional()
          .describe("Rename while moving; keeps the current name if omitted."),
        ref: z.string().min(1).describe("File ref to move."),
        to_folder_ref: z
          .string()
          .nullable()
          .describe("Destination folder; null targets the connection root."),
      }),
      providerScopes: scopes,
      summary: "Move or rename a file",
      handler: (input, ctx) =>
        move(
          ctx,
          input as {
            new_name?: string;
            ref: string;
            to_folder_ref: string | null;
          }
        ),
    });
  }

  return actions;
}
