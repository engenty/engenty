import type { ReactNode } from "react";

interface AppErrorCardProps {
  envPre?: ReactNode;
  hint?: string;
  message: string;
  title: string;
}

export function AppErrorCard({
  title,
  message,
  hint,
  envPre,
}: AppErrorCardProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="ui-card-panel max-w-xl p-6">
        <h1 className="font-semibold text-lg">{title}</h1>
        <p className="mt-2 text-muted-foreground text-sm">{message}</p>
        {hint ? (
          <p className="mt-3 text-muted-foreground text-sm">{hint}</p>
        ) : null}
        {envPre ? (
          <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs">
            {envPre}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
