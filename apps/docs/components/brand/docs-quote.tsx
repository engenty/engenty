import type { EngentyKind } from "@engenty/ui-core/components/engenty";
import type { ComponentProps } from "react";
import { Mascot } from "./mascot";

/**
 * Markdown blockquotes become the section's engenty talking: a chat bubble
 * with a tail, the way avatars speak in a room.
 */
export function DocsQuote({
  kind,
  children,
  ...rest
}: ComponentProps<"blockquote"> & { kind: EngentyKind }) {
  return (
    <div className="docs-quote not-prose">
      <span className="docs-quote-mascot">
        <Mascot animated={false} kind={kind} size={64} />
      </span>
      <blockquote className="hb-bubble" {...rest}>
        {children}
      </blockquote>
    </div>
  );
}
