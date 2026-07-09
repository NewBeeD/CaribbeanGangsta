import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/ui/components';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Global error boundary (Prompt 14). A render fault becomes a legible case-file
 * screen with a recover action, not a white screen — in keeping with "failure reads
 * as narrative, not an error" (design/04 §0.1). The save is untouched, so reloading
 * resumes the run.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced for the telemetry harness (Prompt 25); no PII, just the fault.
    console.error('AppShell crashed:', error, info.componentStack);
  }

  private handleReload = (): void => {
    this.setState({ error: null });
    if (typeof window !== 'undefined') window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="cg-app cg-gate" role="alert">
        <p className="cg-kicker">Case file corrupted</p>
        <h1 className="cg-title">Something went dark.</h1>
        <p className="cg-scene" style={{ marginTop: 12 }}>
          The lights cut out for a second. Your empire is on paper and safe — pick the
          thread back up.
        </p>
        <Button variant="primary" fullWidth onClick={this.handleReload}>
          Pick it back up
        </Button>
      </main>
    );
  }
}
