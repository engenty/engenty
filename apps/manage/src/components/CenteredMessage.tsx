import type { ReactNode } from "react";

export function CenteredMessage({
  title,
  body,
  action,
}: {
  action?: ReactNode;
  body?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="font-semibold text-lg">{title}</h1>
        {body ? (
          <p className="mt-2 text-muted-foreground text-sm">{body}</p>
        ) : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
