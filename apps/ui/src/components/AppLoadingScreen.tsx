interface AppLoadingScreenProps {
  message: string;
  shimmer?: boolean;
}

export function AppLoadingScreen({
  message,
  shimmer = false,
}: AppLoadingScreenProps) {
  return (
    <div
      className={`flex min-h-screen items-center justify-center text-muted-foreground text-sm ${shimmer ? "shimmer" : ""}`}
    >
      {message}
    </div>
  );
}
