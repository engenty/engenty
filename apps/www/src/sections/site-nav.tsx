import { EngentyWordmark } from "@engenty/ui-core/components/engenty";
import { BAND_FILL, BAND_SOFT } from "../components/color-band";
import { GITHUB_URL } from "../copy";
import { useWwwI18n } from "../i18n-provider";

export function SiteNav() {
  const { copy } = useWwwI18n();

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-md"
      style={{
        background: `color-mix(in oklch, ${BAND_FILL.ember} 88%, transparent)`,
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a
          className="font-heading font-semibold text-lg text-white tracking-tight"
          href="#top"
        >
          <EngentyWordmark onDark />
        </a>
        <nav
          className="flex items-center gap-6 text-sm"
          style={{ color: BAND_SOFT }}
        >
          <a
            className="decoration-white/50 underline-offset-4 hover:text-white hover:underline"
            href="#why"
          >
            {copy.nav.features}
          </a>
          <a
            className="decoration-white/50 underline-offset-4 hover:text-white hover:underline"
            href="#install"
          >
            {copy.nav.install}
          </a>
          <a
            className="decoration-white/50 underline-offset-4 hover:text-white hover:underline"
            href={GITHUB_URL}
            rel="noreferrer"
            target="_blank"
          >
            {copy.nav.github}
          </a>
        </nav>
      </div>
    </header>
  );
}
