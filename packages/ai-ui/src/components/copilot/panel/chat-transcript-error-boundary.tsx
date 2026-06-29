"use client";

import { AlertTriangle } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ChatTranscriptErrorBoundaryProps {
  children: ReactNode;
  /** Label for the retry button — pass from the i18n layer. */
  retryLabel?: string;
  /** Generic "something went wrong" headline. */
  title?: string;
}

interface ChatTranscriptErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort error boundary that wraps the chat transcript area.
 * If any child component throws during render, the transcript is replaced
 * with a minimal recovery UI instead of a blank/frozen screen.
 *
 * The boundary is intentionally narrow (transcript only) so the composer
 * remains functional — the user can open a new chat without reloading.
 */
export class ChatTranscriptErrorBoundary extends Component<
  ChatTranscriptErrorBoundaryProps,
  ChatTranscriptErrorBoundaryState
> {
  state: ChatTranscriptErrorBoundaryState = { error: null };

  static getDerivedStateFromError(
    error: Error
  ): ChatTranscriptErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the console in dev; a real telemetry drain can be wired here.
    console.error("[ChatTranscriptErrorBoundary]", error, info.componentStack);
  }

  private readonly handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <ChatTranscriptErrorCard
          error={error}
          onRetry={this.handleRetry}
          retryLabel={this.props.retryLabel}
          title={this.props.title}
        />
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Inline error card — also exported so it can be rendered by the no-response
// guard hook without going through the error boundary class path.
// ---------------------------------------------------------------------------

interface ChatTranscriptErrorCardProps {
  error?: Error | null;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  title?: string;
}

export function ChatTranscriptErrorCard({
  error,
  message,
  onRetry,
  retryLabel = "Retry",
  title = "Something went wrong",
}: ChatTranscriptErrorCardProps) {
  const detail = message ?? error?.message;
  return (
    <div
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm"
      role="alert"
    >
      <AlertTriangle
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-destructive"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-destructive">{title}</p>
        {detail && (
          <p className="break-words text-destructive/80 text-xs">{detail}</p>
        )}
      </div>
      {onRetry && (
        <button
          className="shrink-0 rounded text-destructive text-xs underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive"
          onClick={onRetry}
          type="button"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
