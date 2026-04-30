import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div
            className="max-w-md w-full p-8 text-center space-y-6"
            style={{
              borderRadius: '20px',
              background:
                'linear-gradient(180deg, hsl(var(--card) / 0.92), hsl(var(--card) / 0.78))',
              border: '1px solid hsl(0 0% 100% / 0.05)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              boxShadow:
                '0 0 70px hsl(var(--gold) / 0.04), 0 30px 60px -20px hsl(0 0% 0% / 0.7), inset 0 1px 0 hsl(0 0% 100% / 0.04)',
            }}
          >
            <div className="flex justify-center">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{
                  background:
                    'radial-gradient(circle, hsl(var(--destructive) / 0.18), hsl(var(--destructive) / 0.04) 70%)',
                  border: '1px solid hsl(var(--destructive) / 0.35)',
                  boxShadow:
                    '0 0 24px hsl(var(--destructive) / 0.18), inset 0 0 0 1px hsl(0 0% 100% / 0.04)',
                }}
              >
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </div>

            <div className="space-y-2">
              <h1
                className="text-2xl text-foreground"
                style={{ fontWeight: 600, letterSpacing: '-0.018em' }}
              >
                Oops! Something went wrong
              </h1>
              <p className="text-sm text-muted-foreground" style={{ letterSpacing: '0.012em', lineHeight: 1.55 }}>
                We encountered an unexpected error. Don't worry, your data is safe.
              </p>
            </div>

            {this.state.error && (
              <div
                className="rounded-lg p-4 text-left"
                style={{
                  background: 'hsl(var(--muted) / 0.4)',
                  border: '1px solid hsl(0 0% 100% / 0.05)',
                  boxShadow: 'inset 0 1px 0 hsl(0 0% 100% / 0.03)',
                }}
              >
                <p className="text-xs font-mono text-muted-foreground break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            {/* Hairline gold divider above the actions */}
            <div className="divider-luxe" aria-hidden="true" />

            <div className="space-y-3">
              <Button onClick={this.handleReset} variant="jet" className="w-full gap-2">
                <RefreshCw className="w-4 h-4" />
                Reload App
              </Button>

              <Button
                onClick={() => (window.location.href = "/")}
                variant="outline"
                className="w-full"
              >
                Go to Home
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              If this problem persists, please contact support
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
