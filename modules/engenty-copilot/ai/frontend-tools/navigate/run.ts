import { NAVIGATE_SPEC } from "./definition.js";

export type NavigateLike = (to: string, opts?: { replace?: boolean }) => void;

// Runtime authority for both the typed register handler and the untyped executor
// path (input: unknown), so it validates against the tool's single-source zod
// schema instead of re-parsing by hand. The internal-path check is security
// logic beyond the schema and is kept.
export function runNavigateFrontendTool(
  input: unknown,
  navigate: NavigateLike,
  options?: { onNavigate?: () => void }
): { ok: true } {
  const parsed = NAVIGATE_SPEC.schema.safeParse(input);
  if (!(parsed.success && parsed.data.to.trim())) {
    throw new Error(
      'navigate requires input {"to":"/mdl/<moduleId>"} (internal path).'
    );
  }
  const to = parsed.data.to.trim();
  if (!to.startsWith("/") || to.startsWith("//")) {
    throw new Error("Only internal application paths are allowed.");
  }
  navigate(to, { replace: parsed.data.replace === true });
  options?.onNavigate?.();
  return { ok: true };
}
