import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from "next-themes";

// next-themes renders an inline <script> that sets the theme before first
// paint — for server-rendered pages. This app renders on the client, where
// React never executes it and warns "Encountered a script tag while
// rendering React component". A non-JavaScript type makes it an inert data
// block, which is what it already is here; the provider applies the theme.
const INERT_SCRIPT = { type: "application/json" } as const;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider scriptProps={INERT_SCRIPT} {...props}>
      {children}
    </NextThemesProvider>
  );
}
