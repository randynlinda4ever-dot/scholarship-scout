import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import LegalAcceptanceGate from './components/LegalAcceptanceGate';
import { AnalyticsConsentManager } from './components/AnalyticsConsentManager';
import './index.css';

// Neither the workspace nor its error boundary is imported until after acceptance.
const App = lazy(async () => {
  const [{ default: Workspace }, { default: ErrorBoundary }] = await Promise.all([
    import('./App'),
    import('./components/AppErrorBoundary'),
  ]);
  const AcceptedWorkspace = () => <ErrorBoundary><Workspace /></ErrorBoundary>;
  return { default: AcceptedWorkspace };
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LegalAcceptanceGate>
      <AnalyticsConsentManager />
      <Suspense fallback={<div className="legal-gate-loading" role="status">Loading your workspace…</div>}>
        <App />
      </Suspense>
    </LegalAcceptanceGate>
  </StrictMode>
);
