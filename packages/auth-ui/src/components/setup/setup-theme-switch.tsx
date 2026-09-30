// Light/dark toggle for the wizard. The app's next-themes provider sits above
// the unauthenticated routes (apps/ui main.tsx), so the pick here is the one
// the app keeps after sign-in.

import { cn } from "@engenty/ui-core";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeSwitch({
  copy,
}: {
  copy: { dark: string; light: string };
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <div
      className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted/40 p-0.5"
      role="radiogroup"
    >
      {(
        [
          { icon: Sun, label: copy.light, on: !dark, value: "light" },
          { icon: Moon, label: copy.dark, on: dark, value: "dark" },
        ] as const
      ).map(({ icon: Icon, label, on, value }) => (
        <button
          aria-checked={on}
          aria-label={label}
          className={cn(
            "flex size-7 items-center justify-center rounded-full transition-colors",
            on
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          key={value}
          onClick={() => setTheme(value)}
          role="radio"
          title={label}
          type="button"
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
