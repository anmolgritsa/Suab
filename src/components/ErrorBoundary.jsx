/**
 * ErrorBoundary.jsx — a class error boundary around the routed screen.
 *
 * WHY: React unmounts the WHOLE tree when a component throws during render
 * and nothing catches the error — the user sees a blank page with no way
 * back (this is exactly what the supervisor's Labour Updates feed did when
 * a media URL helper threw). The boundary keeps a crash contained to the
 * screen: the rest of the shell (top bar, navigation) stays usable and the
 * worker can retry or go back instead of being stuck on white.
 *
 * Scope: App.jsx wraps ONLY the routed screen (renderScreen()), so a crash
 * in one screen never takes the login screen or the app shell down.
 * Development keeps the real error in the console (React re-logs it); the
 * fallback UI is intentionally plain and uses the existing design tokens.
 *
 * The fallback copy is translated by a small function component rendered
 * INSIDE the boundary (BoundaryFallback below) — NOT by App via props.
 * WHY: App itself renders the <I18nProvider>, so a useI18n() call in App's
 * own body runs ABOVE the provider, throws 'useI18n must be used inside an
 * <I18nProvider>' during App's first render and — crashing above this very
 * boundary — unmounts the whole tree: the blank page on every screen. The
 * boundary component sits under the provider, so its fallback can translate
 * safely; the optional message/retryLabel props still win when given.
 */

import { Component } from 'react';
import { useI18n } from '../i18n.jsx';

/** The boundary's fallback UI — translated here, under the provider. */
function BoundaryFallback({ message, retryLabel, onRetry }) {
  const { t } = useI18n();
  return (
    <div className="errbound" role="alert">
      <p className="errbound__title">{message ?? t('screenCrashed')}</p>
      <button
        type="button"
        className="btn-primary errbound__retry"
        onClick={onRetry}
      >
        {retryLabel ?? t('screenRetry')}
      </button>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // Surface the real cause in the console — the fallback is for the
    // worker, the stack trace is for the developer.
    console.error('[suab] screen crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <BoundaryFallback
          message={this.props.message}
          retryLabel={this.props.retryLabel}
          onRetry={() => this.setState({ hasError: false })}
        />
      );
    }
    return this.props.children;
  }
}
