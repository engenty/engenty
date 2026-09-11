import { Engenty } from "@engenty/ui-core/components/engenty";
import {
  BAND_CREAM,
  BAND_FILL,
  BAND_MUTED,
  BAND_SOFT,
  ColorBand,
} from "../components/color-band";
import { HeadlinePerch } from "../components/headline-perch";
import { Reveal } from "../components/reveal";
import { GITHUB_URL } from "../copy";
import { useWwwI18n } from "../i18n-provider";

export function Hero() {
  const { copy } = useWwwI18n();

  return (
    <ColorBand highlight="tr" id="top" tone="ember">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-16 pb-24 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24">
        <Reveal travel={28}>
          <div className="space-y-8">
            <p
              className="font-mono text-xs uppercase tracking-[0.14em]"
              style={{ color: BAND_SOFT }}
            >
              {copy.hero.kicker}
            </p>
            <HeadlinePerch
              as="h1"
              className="font-heading font-semibold text-[length:var(--t-display-l)] text-white leading-[1.05] tracking-tight"
              kind="drop"
              perchWord={copy.hero.headlinePerch}
              size={83}
              title={copy.hero.headline}
            >
              <br />
              <em className="not-italic" style={{ color: BAND_CREAM }}>
                {copy.hero.headlineEm}
              </em>
            </HeadlinePerch>
            <p
              className="max-w-xl text-lg leading-relaxed"
              style={{ color: BAND_MUTED }}
            >
              {copy.hero.sub}
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                className="inline-flex h-11 items-center rounded-[6px] bg-white px-5 font-medium text-sm hover:bg-white/90"
                href={GITHUB_URL}
                rel="noreferrer"
                style={{ color: BAND_FILL.ember }}
                target="_blank"
              >
                {copy.hero.ctaGithub}
              </a>
              <a
                className="inline-flex h-11 items-center rounded-[6px] px-5 font-medium text-sm text-white decoration-white/70 underline-offset-4 hover:underline"
                href="#install"
              >
                {copy.hero.ctaInstall}
              </a>
            </div>
          </div>
        </Reveal>
        <Reveal
          className="flex justify-center lg:justify-end"
          delay={120}
          travel={36}
        >
          <Engenty kind="round" size={340} />
        </Reveal>
      </div>
    </ColorBand>
  );
}
