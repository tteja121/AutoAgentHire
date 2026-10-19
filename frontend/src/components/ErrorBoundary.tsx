import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
    this.setState({ error, errorInfo });

    // Handle chunk load failures after new deployments automatically
    const isChunkLoadFailed =
      error.message &&
      (error.message.includes("Failed to fetch dynamically imported module") ||
       error.message.includes("Importing a module script failed") ||
       error.message.includes("error loading dynamically imported module"));

    if (isChunkLoadFailed && typeof window !== "undefined") {
      const reloadKey = "chunk_reload_" + window.location.pathname;
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="max-w-md w-full p-8 rounded-2xl bg-card border border-border shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive mx-auto flex items-center justify-center">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">Something went wrong</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                An unexpected error occurred while loading this view. You can reload the page or return to the main portal.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-muted/50 border border-border rounded-xl text-left overflow-auto max-h-32 text-xs font-mono text-muted-foreground">
                <span className="text-destructive font-semibold">Error:</span> {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                onClick={this.handleReset}
                className="flex-1 gap-2"
                variant="default"
              >
                <RefreshCw className="w-4 h-4" />
                Reload
              </Button>
              <Button
                onClick={() => { window.location.href = "/"; }}
                className="flex-1 gap-2"
                variant="outline"
              >
                <Home className="w-4 h-4" />
                Home
              </Button>
              <Button
                onClick={() => { window.location.href = "/login"; }}
                className="flex-1 gap-2"
                variant="secondary"
              >
                <LogIn className="w-4 h-4" />
                Login
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
