import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

type ThemeValue = (typeof options)[number]["value"];

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {options.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;

        return (
          <button
            className={cn(
              "flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-sm transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background hover:bg-accent"
            )}
            key={option.value}
            onClick={() => setTheme(option.value as ThemeValue)}
            type="button"
          >
            <Icon className="size-4" />
            <span className="hidden sm:inline">{option.label}</span>
            {active && <Check className="size-3.5" />}
          </button>
        );
      })}
    </div>
  );
}
