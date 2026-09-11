// Read-only JSON, in the same editor the code view uses.
//
// A schema or a tool's arguments read as structure, and structure is what
// syntax colouring shows: which braces close, where a nested object starts,
// which leaves are strings. A monochrome `<pre>` makes the reader do that work
// by eye.
import { WorkspaceCodeEditor } from "../agents-workspace/workspace-code-editor.js";

/** Line height Monaco renders at 13px, plus the editor's own top/bottom pad. */
const LINE_HEIGHT = 19;
const PADDING = 16;
const MIN_LINES = 2;
/** Past this, scroll inside the box rather than pushing the rail's own content
 *  off screen — an inspector that grows to 200 lines stops being an inspector. */
const MAX_LINES = 18;

export function JsonView({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2) ?? "null";
  const lines = text.split("\n").length;
  const height =
    Math.min(Math.max(lines, MIN_LINES), MAX_LINES) * LINE_HEIGHT + PADDING;
  return (
    <div
      className="flex overflow-hidden rounded-md border bg-muted/40"
      style={{ height }}
    >
      <WorkspaceCodeEditor
        filePath="value.json"
        onChange={() => undefined}
        readOnly
        value={text}
      />
    </div>
  );
}
