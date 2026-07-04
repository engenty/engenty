import { cn } from "@engenty/ui-core";

interface DocumentHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function DocumentHeader({ children, className }: DocumentHeaderProps) {
  return (
    <div className={cn("w-full bg-card shadow-bottom shadow-sm", className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-2 py-4 sm:px-4">
        {children}
      </div>
    </div>
  );
}
