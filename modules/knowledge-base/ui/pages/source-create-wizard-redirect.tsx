/**
 * `/sources/new` — a deep link to the add-source wizard.
 *
 * The wizard is a modal, so the URL cannot be its home: it redirects to the
 * sources list and asks that page to open it, which also gives the modal real
 * content behind it instead of an empty shell.
 */

import { Navigate } from "react-router-dom";
import { kbSourceAddSearch } from "../kb-open-source-add-state.js";
import { kbSourcesPath } from "../kb-paths.js";

export function SourceCreateWizardRedirect() {
  return (
    <Navigate replace to={`${kbSourcesPath()}${kbSourceAddSearch("wizard")}`} />
  );
}
