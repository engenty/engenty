import { initUiI18n } from "@engenty/i18n/ui";
import { EngentyQueryProvider } from "@engenty/query-client";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import "./index.css";

async function bootstrap() {
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
        storageKey="engenty-manage-theme"
      >
        <EngentyQueryProvider>
          <BrowserRouter basename="/manage">
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
