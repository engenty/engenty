import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app";
import {
  applyDocumentLocale,
  navigatorWwwLanguages,
  parseWwwLocalePath,
  readStoredLocalePref,
  resolveRootRedirectLocale,
} from "./i18n";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element missing");
}

const pathLocale = parseWwwLocalePath(window.location.pathname);
applyDocumentLocale(
  pathLocale ??
    resolveRootRedirectLocale(readStoredLocalePref(), navigatorWwwLanguages())
);

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
