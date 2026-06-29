import type { ReactNode } from "react";

interface PasswordAuthBlockProps {
  children: ReactNode;
  error?: string | null;
  footer?: ReactNode;
  isLoading?: boolean;
  mode: "login" | "signup";
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

export function PasswordAuthBlock({
  mode,
  isLoading,
  error,
  onSubmit,
  children,
  footer,
}: PasswordAuthBlockProps) {
  return (
    <div className="space-y-4">
      <form
        aria-label={mode === "login" ? "Login form" : "Signup form"}
        className="space-y-4"
        onSubmit={onSubmit}
      >
        {children}
      </form>
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm">
          {error}
        </div>
      )}
      {isLoading && (
        <p className="text-muted-foreground text-xs">
          Processing authentication...
        </p>
      )}
      {footer && <div className="text-center text-sm">{footer}</div>}
    </div>
  );
}
