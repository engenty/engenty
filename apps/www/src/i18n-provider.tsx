import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  applyDocumentLocale,
  getWwwCopy,
  persistWwwLocalePref,
  readStoredLocalePref,
  type WwwCopy,
  type WwwLocale,
  type WwwLocalePref,
} from "./i18n";

interface WwwI18nValue {
  copy: WwwCopy;
  locale: WwwLocale;
  pref: WwwLocalePref;
  setPref: (pref: WwwLocalePref) => void;
}

const WwwI18nContext = createContext<WwwI18nValue | null>(null);

export function WwwI18nProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: WwwLocale;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [pref, setPrefState] = useState<WwwLocalePref>(
    () => readStoredLocalePref() ?? "auto"
  );

  useLayoutEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const setPref = useCallback(
    (next: WwwLocalePref) => {
      persistWwwLocalePref(next);
      setPrefState(next);
      navigate({
        hash: location.hash,
        pathname: next === "auto" ? "/" : `/${next}`,
        search: location.search,
      });
    },
    [location.hash, location.search, navigate]
  );

  const value = useMemo(
    () => ({
      copy: getWwwCopy(locale),
      locale,
      pref,
      setPref,
    }),
    [locale, pref, setPref]
  );

  return (
    <WwwI18nContext.Provider value={value}>{children}</WwwI18nContext.Provider>
  );
}

export function useWwwI18n(): WwwI18nValue {
  const ctx = useContext(WwwI18nContext);
  if (!ctx) {
    throw new Error("useWwwI18n must be used within WwwI18nProvider");
  }
  return ctx;
}
