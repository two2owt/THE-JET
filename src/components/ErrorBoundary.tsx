import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { getSentry } from "@/lib/sentry";

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
    // Forward to Sentry so boundary-caught crashes are visible in prod monitoring.
    // Fails silently if Sentry hasn't loaded yet or the DSN isn't configured.
    getSentry()
      .then((Sentry) => {
        if (!Sentry) return;
        Sentry.captureException(error, {
          contexts: { react: { componentStack: errorInfo.componentStack } },
        });
      })
      .catch(() => {
        /* observability best-effort */
      });
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

            <div className="space-y-3">
              <p className="heading-luxe-eyebrow" style={{ color: 'hsl(var(--destructive) / 0.85)' }}>
                Unexpected error
              </p>
              <h1 className="heading-luxe-display">
                Something went sideways
              </h1>
              <p className="body-luxe-muted" style={{ maxWidth: '32ch', marginLeft: 'auto', marginRight: 'auto' }}>
                A glitch interrupted the experience. Your data is safe — give it another moment.
              </p>
            </div>

            {this.state.error && (
              <div
                className="rounded-lg p-4 text-left space-y-1.5"
                style={{
                  background: 'hsl(var(--muted) / 0.4)',
                  border: '1px solid hsl(0 0% 100% / 0.05)',
                  boxShadow: 'inset 0 1px 0 hsl(0 0% 100% / 0.03)',
                }}
              >
                <p className="heading-luxe-eyebrow">Error detail</p>
                <p
                  className="text-xs font-mono break-all"
                  style={{
                    color: 'hsl(var(--muted-foreground))',
                    lineHeight: 1.55,
                    letterSpacing: '0.005em',
                  }}
                >
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

            <p className="body-luxe-muted" style={{ fontSize: '0.75rem' }}>
              If this keeps happening, reach out to support — we're on it.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
