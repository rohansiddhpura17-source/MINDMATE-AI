import React from 'react';

interface State {
  error: Error | null;
}

/**
 * Top-level safety net: if any component throws while rendering, show the error
 * instead of an unexplained blank white page.
 */
export default class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[MindMate] Unhandled render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6 font-['Inter',sans-serif]">
        <div role="alert" className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-bold text-red-700 mb-2">MindMate failed to load</h1>
          <p className="text-sm text-slate-600 mb-4">
            An unexpected error occurred while rendering the app. Check the browser console for details.
          </p>
          <pre className="text-xs bg-red-50 text-red-800 rounded-lg p-3 overflow-auto whitespace-pre-wrap">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
