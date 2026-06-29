import { Button } from "@engenty/ui-core";
import { CircleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface CopilotModuleErrorBoundaryProps {
  children: ReactNode;
  description: string;
  reloadLabel: string;
  title: string;
}

interface CopilotModuleErrorBoundaryState {
  hasError: boolean;
}

export class CopilotModuleErrorBoundary extends Component<
  CopilotModuleErrorBoundaryProps,
  CopilotModuleErrorBoundaryState
> {
  state: CopilotModuleErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CopilotModuleErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Keep chat shell chrome visible; show a local recovery surface only.
  }

  private readonly handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 px-page text-center">
          <CircleAlert aria-hidden className="size-8 text-destructive" />
          <div className="max-w-md space-y-1">
            <p className="font-medium text-base">{this.props.title}</p>
            <p className="text-muted-foreground text-sm">
              {this.props.description}
            </p>
          </div>
          <Button onClick={this.handleReload} size="sm" type="button">
            {this.props.reloadLabel}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
