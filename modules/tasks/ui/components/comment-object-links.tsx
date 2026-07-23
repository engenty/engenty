// Turns object references inside comment text into links to the real record.
//
// Agents report what they did in prose ("Created contact, ID: 019f…"), which
// leaves a reviewer approving work they cannot see. When a comment carries a
// canonical `<module>:<entity>:<id>` reference (the same scheme chat object
// refs and retrieval entity_refs use), render it as a chip that deep-links into
// the owning module via its registered object widget.
//
// Refs whose module/entity has no registered widget — or no deep link — are
// left as plain text rather than rendered as a dead link.

import { type ObjectRef, parseObjectRef } from "@engenty/ai-core/browser";
import { useObjectWidget } from "@engenty/ai-ui";
import { cn } from "@engenty/ui-core";
import { Fragment } from "react";
import { Link } from "react-router-dom";

/**
 * A bare `module:entity:id` occurrence. Module/entity are constrained slugs and
 * the id is a uuid — narrow enough that ordinary prose (or a `http://` url)
 * cannot match by accident.
 */
const OBJECT_REF_PATTERN =
  /\b([a-z][a-z0-9-]*):([a-z][a-z0-9_-]*):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi;

function ObjectRefChip({ objectRef }: { objectRef: ObjectRef }) {
  const widget = useObjectWidget(objectRef);
  const href = widget?.getHref?.(objectRef) ?? null;
  const label = `${objectRef.entity} ${objectRef.id.slice(0, 8)}`;

  if (!href) {
    return <code className="text-xs">{label}</code>;
  }

  return (
    <Link
      className={cn(
        "inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 align-baseline",
        "font-medium text-primary text-xs no-underline hover:bg-primary/20"
      )}
      to={href}
    >
      {label}
    </Link>
  );
}

/**
 * Recursively linkify refs in rendered markdown children. Only bare strings are
 * inspected — element children (links, code spans) are passed through untouched
 * so an id inside a fenced block stays literal.
 */
export function linkifyChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") {
    return linkifyObjectRefs(children);
  }
  if (Array.isArray(children)) {
    return children.map((child, index) =>
      typeof child === "string" ? (
        <Fragment key={index}>{linkifyObjectRefs(child)}</Fragment>
      ) : (
        child
      )
    );
  }
  return children;
}

/**
 * Split text on object refs, rendering each as a chip. Returns the original
 * string unchanged when it holds no refs, so the common case costs nothing.
 */
export function linkifyObjectRefs(text: string): React.ReactNode {
  OBJECT_REF_PATTERN.lastIndex = 0;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match = OBJECT_REF_PATTERN.exec(text);
  let key = 0;

  while (match) {
    const objectRef = parseObjectRef(match[0]);
    if (objectRef) {
      if (match.index > lastIndex) {
        nodes.push(text.slice(lastIndex, match.index));
      }
      nodes.push(<ObjectRefChip key={`ref-${key}`} objectRef={objectRef} />);
      key += 1;
      lastIndex = match.index + match[0].length;
    }
    match = OBJECT_REF_PATTERN.exec(text);
  }

  if (nodes.length === 0) {
    return text;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}
