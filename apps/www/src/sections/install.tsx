import {
  BAND_FILL,
  BAND_MUTED,
  BAND_SOFT,
  ColorBand,
} from "../components/color-band";
import { HeadlinePerch } from "../components/headline-perch";
import { Reveal } from "../components/reveal";
import { GITHUB_URL } from "../copy";
import { useWwwI18n } from "../i18n-provider";

export function Install() {
  const { copy } = useWwwI18n();

  return (
    <ColorBand
      className="scroll-mt-24"
      highlight="tl"
      id="install"
      tone="ember"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[1fr_1.1fr]">
        <Reveal travel={16}>
          <p
            className="font-mono text-xs uppercase tracking-[0.14em]"
            style={{ color: BAND_SOFT }}
          >
            {copy.install.kicker}
          </p>
          <HeadlinePerch
            className="mt-3 font-heading font-semibold text-[length:var(--t-h1)] text-white tracking-tight"
            kind="sprout"
            perchWord={copy.install.perch}
            size={70}
            title={copy.install.title}
          />
          <p
            className="mt-4 max-w-md leading-relaxed"
            style={{ color: BAND_MUTED }}
          >
            {copy.install.body}
          </p>
          <a
            className="mt-8 inline-flex h-11 items-center rounded-[6px] bg-white px-5 font-medium text-sm hover:bg-white/90"
            href={GITHUB_URL}
            rel="noreferrer"
            style={{ color: BAND_FILL.ember }}
            target="_blank"
          >
            {copy.hero.ctaGithub}
          </a>
        </Reveal>
        <Reveal delay={120} travel={16}>
          <pre className="www-mock overflow-x-auto bg-black/25 p-5 font-mono text-[13px] text-white leading-7">
            {copy.install.commands.map((line) => (
              <div key={line}>
                <span style={{ color: BAND_SOFT }}>$ </span>
                {line}
              </div>
            ))}
          </pre>
        </Reveal>
      </div>
    </ColorBand>
  );
}
