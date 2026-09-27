import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { buildApiUrl } from '@/api/config';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  /** Friendly, user-safe message. Raw detail is NEVER rendered. */
  message: string;
  /** Server-assigned reference so the user can quote it to support. */
  reference: string | null;
}

/**
 * Global render-crash boundary.
 *
 * Policy: users (customers, fundis, company staff) must never see raw
 * technical errors. On a crash we:
 *   1. show a friendly message (+ retry),
 *   2. fire-and-forget the full detail to POST /api/client-errors, where the
 *      backend logs it to error_logs and notifies the DevOps team,
 *   3. keep full detail in the browser console for developers only.
 */
export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', reference: null };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: 'Something went wrong while displaying this page. Our team has been notified automatically.',
      reference: null,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Developer-facing console output only — never rendered to the user.
    console.error('[RouteErrorBoundary]', error, info.componentStack);

    // Report to staff (fire-and-forget — must never throw or block UI).
    try {
      const csrf = typeof document !== 'undefined'
        ? document.cookie.match(/(?:^|; )csrf_token=([^;]*)/)?.[1]
        : null;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      fetch(buildApiUrl('/client-errors'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          message: error?.message || 'Unknown render error',
          stack: [error?.stack, info.componentStack].filter(Boolean).join('\n\n--- component stack ---\n\n').slice(0, 4000),
          page: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : undefined,
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (res.ok) {
            const body = await res.json().catch(() => null) as { reference?: string } | null;
            // Reference is returned only when the backend assigns one.
            if (body?.reference) this.setState({ reference: body.reference });
          }
        })
        .catch(() => {})
        .finally(() => clearTimeout(timeout));
    } catch {
      // Reporting is best-effort; swallow everything.
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <h2 className="text-lg font-semibold">{this.props.fallbackTitle || 'Something went wrong'}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{this.state.message}</p>
        {this.state.reference && (
          <p className="max-w-md text-xs text-muted-foreground">
            Reference: <span className="font-mono font-medium">{this.state.reference}</span> - quote this if you contact support.
          </p>
        )}
        <Button onClick={() => this.setState({ hasError: false, message: '', reference: null })}>Try again</Button>
      </div>
    );
  }
}
