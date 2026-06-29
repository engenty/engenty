"use client";

import { Button } from "@engenty/ui-core";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { Component } from "react";

interface CopilotErrorDebugContext {
  contributionTitle?: string;
  dockMode?: string;
  moduleId: string;
  pathname: string;
  routeKey: string;
}

interface CopilotSurfaceErrorBoundaryProps {
  children: ReactNode;
  debugContext: CopilotErrorDebugContext;
  onClose: () => void;
  resetKey: string;
}

interface CopilotSurfaceErrorBoundaryState {
  error: Error | null;
}

export class CopilotSurfaceErrorBoundary extends Component<
  CopilotSurfaceErrorBoundaryProps,
  CopilotSurfaceErrorBoundaryState
> {
  state: CopilotSurfaceErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[copilot] surface render failed", {
      componentStack: info.componentStack,
      debugContext: this.props.debugContext,
      error,
    });
  }

  override componentDidUpdate(
    prevProps: CopilotSurfaceErrorBoundaryProps
  ): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const { debugContext, onClose } = this.props;

    return (
      <div className="fixed right-4 bottom-20 z-10000 w-full max-w-md rounded-lg border border-destructive/40 bg-background p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h2 className="font-semibold text-sm">Copilot crashed</h2>
              <p className="text-muted-foreground text-sm">
                Check the browser console for the captured debug payload.
              </p>
            </div>
            <div className="rounded-md bg-muted/60 px-3 py-2 font-mono text-xs">
              <div>{`path=${debugContext.pathname}`}</div>
              <div>{`module=${debugContext.moduleId}`}</div>
              <div>{`route=${debugContext.routeKey}`}</div>
              <div>{`mode=${debugContext.dockMode ?? "unknown"}`}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={onClose} size="sm" variant="outline">
                Close copilot
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
