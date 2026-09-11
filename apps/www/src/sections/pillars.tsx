import type { EngentyKind } from "@engenty/ui-core/components/engenty";
import { BAND_CREAM, BAND_MUTED, ColorBand } from "../components/color-band";
import { HeadlinePerch } from "../components/headline-perch";
import { Reveal } from "../components/reveal";
import { useWwwI18n } from "../i18n-provider";

const PILLAR_KIND: Record<string, EngentyKind> = {
  "ag-ui": "dome",
  data: "flame",
  models: "oval",
  plugins: "drop",
  spaces: "round",
};

export function Pillars() {
  const { copy } = useWwwI18n();

  return (
    <ColorBand className="scroll-mt-24" highlight="tl" id="why" tone="amber">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {copy.pillars.map((pillar, index) => (
            <Reveal delay={index * 70} key={pillar.id} travel={24}>
              <a className="group block" href={`#${pillar.id}`}>
                <p className="font-mono text-xs" style={{ color: BAND_CREAM }}>
                  {pillar.kicker}
                </p>
                <HeadlinePerch
                  className="mt-2 font-heading font-semibold text-lg text-white tracking-tight decoration-white/80 underline-offset-4 group-hover:underline"
                  kind={PILLAR_KIND[pillar.id] ?? "round"}
                  size={51}
                  title={pillar.title}
                />
                <p
                  className="mt-2 text-sm leading-relaxed no-underline"
                  style={{ color: BAND_MUTED }}
                >
                  {pillar.body}
                </p>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </ColorBand>
  );
}
