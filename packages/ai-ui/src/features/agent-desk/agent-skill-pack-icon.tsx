import { Sparkles } from "lucide-react";

export function PackIcon({
  className = "size-8",
  emoji,
}: {
  className?: string;
  emoji: string | null;
}) {
  if (emoji) {
    return (
      <span
        aria-hidden
        className={`flex ${className} shrink-0 items-center justify-center text-2xl leading-none`}
      >
        {emoji}
      </span>
    );
  }
  return (
    <span
      className={`flex ${className} shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground`}
    >
      <Sparkles className="size-4" />
    </span>
  );
}
