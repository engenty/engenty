import { Engenty } from "@engenty/ui-core/components/engenty";
import { BAND_FILL } from "../components/color-band";
import { LocaleChooser } from "../components/locale-chooser";
import { GITHUB_URL } from "../copy";
import { useWwwI18n } from "../i18n-provider";

export function SiteFooter() {
  const { copy } = useWwwI18n();

  return (
    <footer
      className="relative"
      style={{
        background: BAND_FILL.ember,
        borderTop: "1px solid oklch(100% 0 0 / 0.12)",
      }}
    >
      <div className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-10">
        <div className="flex items-center gap-3">
          <Engenty kind="drop" size={45} />
          <Engenty kind="dome" size={45} />
          <Engenty kind="flame" size={45} />
          <p className="font-heading text-sm text-white">{copy.footer}</p>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <LocaleChooser />
          <a
            className="text-sm text-white/55 decoration-white/50 underline-offset-4 hover:text-white hover:underline"
            href={GITHUB_URL}
            rel="noreferrer"
            target="_blank"
          >
            github.com/engenty/engenty
          </a>
        </div>
      </div>
    </footer>
  );
}
