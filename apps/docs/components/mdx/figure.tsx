import type { ReactNode } from "react";
import "./figure.css";

export interface FigureProps {
  /** The sentence under the drawing. Say what the picture argues, not what it contains. */
  caption?: ReactNode;
  children: ReactNode;
  /** Bolded lead-in, e.g. "Figure 2." */
  label?: string;
}

/**
 * Frame for a hand-drawn architecture figure: inline SVG written against the
 * class vocabulary in `figure.css`, so one drawing follows the site's theme
 * instead of carrying colours of its own.
 *
 * ```mdx
 * <Figure label="Figure 1." caption="What the picture argues.">
 *   <svg viewBox="0 0 900 400" role="img" aria-label="…">…</svg>
 * </Figure>
 * ```
 *
 * The `aria-label` is not optional: a screen reader gets that sentence and
 * nothing else, so it has to carry the same content as the drawing.
 */
export function Figure({ caption, children, label }: FigureProps) {
  return (
    <figure className="efig">
      <div className="efig-box">{children}</div>
      {caption ? (
        <figcaption>
          {label ? <b>{label}</b> : null}
          {label ? " " : null}
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
