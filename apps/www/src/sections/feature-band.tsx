import type { EngentyKind } from "@engenty/ui-core/components/engenty";
import type { ReactNode } from "react";
import { cn } from "../cn";
import {
  BAND_MUTED,
  BAND_SOFT,
  type BandTone,
  ColorBand,
  type HighlightCorner,
} from "../components/color-band";
import { HeadlinePerch } from "../components/headline-perch";
import { Reveal } from "../components/reveal";

export function FeatureBand({
  body,
  children,
  highlight = "tr",
  id,
  kicker,
  mascot,
  perchWord,
  reverse = false,
  title,
  tone,
}: {
  body: string;
  children: ReactNode;
  highlight?: HighlightCorner;
  id: string;
  kicker: string;
  mascot: EngentyKind;
  perchWord?: string;
  reverse?: boolean;
  title: string;
  tone: BandTone;
}) {
  return (
    <ColorBand
      className="scroll-mt-24"
      highlight={highlight}
      id={id}
      tone={tone}
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
        <Reveal className={cn(reverse && "lg:order-2")} travel={16}>
          <p
            className="font-mono text-xs uppercase tracking-[0.14em]"
            style={{ color: BAND_SOFT }}
          >
            {kicker}
          </p>
          <HeadlinePerch
            className="mt-3 font-heading font-semibold text-[length:var(--t-h1)] text-white tracking-tight"
            kind={mascot}
            perchWord={perchWord}
            size={70}
            title={title}
          />
          <p
            className="mt-4 max-w-md leading-relaxed"
            style={{ color: BAND_MUTED }}
          >
            {body}
          </p>
        </Reveal>
        <Reveal className={cn(reverse && "lg:order-1")} delay={140} travel={16}>
          {children}
        </Reveal>
      </div>
    </ColorBand>
  );
}
