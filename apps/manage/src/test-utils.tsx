import { EngentyQueryProvider } from "@engenty/query-client";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Render a page under a router + query provider. When `path` is given the page
 * is mounted on that route so `useParams` resolves from `initialEntry`.
 */
export function renderPage(
  element: ReactNode,
  options: { path?: string; initialEntry?: string } = {}
) {
  const { path, initialEntry } = options;
  return render(
    <EngentyQueryProvider>
      <MemoryRouter initialEntries={[initialEntry ?? path ?? "/"]}>
        {path ? (
          <Routes>
            <Route element={element} path={path} />
          </Routes>
        ) : (
          element
        )}
      </MemoryRouter>
    </EngentyQueryProvider>
  );
}
