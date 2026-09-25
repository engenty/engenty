import { initUiI18n } from "@engenty/i18n/ui";
import { EngentyQueryProvider } from "@engenty/query-client";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import { initDesktopRuntime } from "./desktop/desktop-runtime";
import { installDesktopShellListeners } from "./desktop/desktop-shell-listeners";
import { ServerPickerScreen } from "./desktop/ServerPickerScreen";
import { installInteractionDiagnostics } from "./lib/interaction-diagnostics";
import "./index.css";

async function bootstrap() {
  installInteractionDiagnostics();
  installDesktopShellListeners();
  // Desktop shell: apply the stored server config before anything reads env.
  // Without a configured server, show the picker and boot after a reload.
  if (!initDesktopRuntime()) {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
          storageKey="engenty-ui-theme"
        >
          <ServerPickerScreen onConnected={() => window.location.reload()} />
        </ThemeProvider>
      </StrictMode>
    );
    return;
  }
  const i18nApi = await initUiI18n({
    coreNamespaces: {
      common: {
        en: () => import("./locales/en/common.json").then((m) => m.default),
        de: () => import("./locales/de/common.json").then((m) => m.default),
      },
    },
  });
  await Promise.all([
    i18nApi.preloadCoreNamespaces("en"),
    i18nApi.preloadCoreNamespaces("de"),
  ]);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        disableTransitionOnChange
        enableSystem
        storageKey="engenty-ui-theme"
      >
        <EngentyQueryProvider>
          <BrowserRouter
            // React Router wraps location updates in startTransition by default;
            // this app uses useSyncExternalStore (copilot/host/live-cache).
            // Transitions get starved (~867 sync commits) until React’s 5s
            // expiration. Official escape hatch: useTransitions={false}
            // (RR 7.18.4 calls setStateImpl synchronously). Do not use
            // per-link flushSync workarounds.
            //
            // Re-evaluate this flag on react / react-dom / react-router-dom
            // upgrades by re-running the interaction smoke suite:
            // `pnpm test:smoke:interaction` (and `pnpm test:smoke:prod` when
            // a production gateway origin is available). Warm space-switch
            // p95 must stay under 100ms with zero 5s outliers before the
            // flag can come off.
            useTransitions={false}
          >
            <NuqsAdapter>
              <App />
            </NuqsAdapter>
          </BrowserRouter>
        </EngentyQueryProvider>
      </ThemeProvider>
    </StrictMode>
  );
}
bootstrap();
