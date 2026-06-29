import { z } from "zod";

const agentThreadIdSchema = z.string().uuid();

/** Canonical `ai.thread` id shape (UUID string). */
export function isAgentThreadId(value: string): boolean {
  return agentThreadIdSchema.safeParse(value.trim()).success;
}
