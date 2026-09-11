import { Engenty, type EngentyKind } from "@engenty/ui-core/components/engenty";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { perchParts } from "../perch";

/** A flat engenty sitting on a word in a heading. */
export function HeadlinePerch({
  as: Tag = "h2",
  children,
  className,
  kind,
  perchWord,
  size = 40,
  title,
}: {
  as?: "h1" | "h2";
  children?: ReactNode;
  className?: string;
  kind: EngentyKind;
  perchWord?: string;
  size?: number;
  title: string;
}) {
  const [before, perch, after] = perchParts(title, perchWord);

  return (
    <Tag className={cn("relative", className)}>
      {before}
      <span className="relative inline-block">
        <span
          aria-hidden="true"
          className="www-sit pointer-events-none absolute bottom-[0.82em] left-1/2 z-10 -translate-x-1/2"
        >
          <Engenty kind={kind} size={size} />
        </span>
        {perch}
      </span>
      {after}
      {children}
    </Tag>
  );
}
