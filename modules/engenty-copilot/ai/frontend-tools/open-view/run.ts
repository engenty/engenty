import { OPEN_VIEW_SPEC } from "./definition.js";

export interface OpenViewResult {
  /** `pane`: opened beside the chat. `page`: became the main content. */
  frame: "page" | "pane";
  ok: true;
  path: string;
}

export interface OpenViewDeps {
  /** Open the page as the main content, keeping the companion open. */
  navigate: (path: string) => void;
  /** Open `path` in the visible desk's pane; false when no desk is showing. */
  openInPane: (
    view: { path: string; title?: string },
    opts: { expanded?: boolean }
  ) => boolean;
  /** Whether some registered route renders `path`. Absent: cannot tell. */
  pathMatches?: (path: string) => boolean;
}

/**
 * Runtime authority for `open_view` (typed handler and untyped executor path).
 * The internal-path check is security logic beyond the schema.
 */
export function runOpenViewFrontendTool(
  input: unknown,
  deps: OpenViewDeps
): OpenViewResult {
  const parsed = OPEN_VIEW_SPEC.schema.safeParse(input);
  const path = parsed.success ? parsed.data.path.trim() : "";
  if (!(parsed.success && path)) {
    throw new Error(
      'open_view requires input {"path":"/s/<space_key>/<module>/<page>"}.'
    );
  }
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Only internal application paths are allowed.");
  }
  if (deps.pathMatches && !deps.pathMatches(path)) {
    throw new Error(
      `No page is registered at ${path}. Use /s/<space_key>/<module>/<page>.`
    );
  }
  const { expanded, title } = parsed.data;
  const view = { path, ...(title?.trim() ? { title: title.trim() } : {}) };
  if (deps.openInPane(view, expanded === undefined ? {} : { expanded })) {
    return { frame: "pane", ok: true, path };
  }
  deps.navigate(path);
  return { frame: "page", ok: true, path };
}
