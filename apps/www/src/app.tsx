import { Navigate, useLocation } from "react-router-dom";
import { MockAgUi } from "./components/mock-ag-ui";
import { MockSpaceHome } from "./components/mock-space-home";
import { MockStack } from "./components/mock-stack";
import {
  navigatorWwwLanguages,
  parseWwwLocalePath,
  readStoredLocalePref,
  resolveRootRedirectLocale,
  type WwwLocale,
} from "./i18n";
import { useWwwI18n, WwwI18nProvider } from "./i18n-provider";
import { FeatureBand } from "./sections/feature-band";
import { Hero } from "./sections/hero";
import { Install } from "./sections/install";
import { Pillars } from "./sections/pillars";
import { SiteFooter } from "./sections/site-footer";
import { SiteNav } from "./sections/site-nav";

function Landing() {
  const { copy } = useWwwI18n();

  return (
    <div className="min-h-screen">
      <SiteNav />
      <main>
        <Hero />
        <Pillars />
        <div id="plugins">
          <FeatureBand
            body={copy.features.spaces.body}
            highlight="tr"
            id="spaces"
            kicker={copy.features.spaces.kicker}
            mascot="round"
            perchWord={copy.features.spaces.perch}
            title={copy.features.spaces.title}
            tone="cobalt"
          >
            <MockSpaceHome />
          </FeatureBand>
        </div>
        <FeatureBand
          body={copy.features.agUi.body}
          highlight="bl"
          id="ag-ui"
          kicker={copy.features.agUi.kicker}
          mascot="drop"
          perchWord={copy.features.agUi.perch}
          reverse
          title={copy.features.agUi.title}
          tone="moss"
        >
          <MockAgUi />
        </FeatureBand>
        <div id="models">
          <FeatureBand
            body={copy.features.stack.body}
            highlight="tl"
            id="data"
            kicker={copy.features.stack.kicker}
            mascot="flame"
            perchWord={copy.features.stack.perch}
            title={copy.features.stack.title}
            tone="rose"
          >
            <MockStack />
          </FeatureBand>
        </div>
        <Install />
      </main>
      <SiteFooter />
    </div>
  );
}

function LocalizedLanding({ locale }: { locale: WwwLocale }) {
  return (
    <WwwI18nProvider locale={locale}>
      <Landing />
    </WwwI18nProvider>
  );
}

function RootRedirect() {
  const location = useLocation();
  const locale = resolveRootRedirectLocale(
    readStoredLocalePref(),
    navigatorWwwLanguages()
  );

  return (
    <Navigate
      replace
      to={{
        hash: location.hash,
        pathname: `/${locale}`,
        search: location.search,
      }}
    />
  );
}

export function App() {
  const { pathname } = useLocation();
  const locale = parseWwwLocalePath(pathname);
  if (!locale) {
    return <RootRedirect />;
  }
  return <LocalizedLanding locale={locale} />;
}
