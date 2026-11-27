import { Component, type ErrorInfo, type ReactNode } from "react";
import { recordReliabilityEvent } from "../lib/reliabilityMonitor.js";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    recordReliabilityEvent("react_render_error");
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-crash" role="alert">
          <h1>Scholarship Scout could not display this page.</h1>
          <p>Your locally saved information has not been intentionally cleared. Reload the app to try again.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload Scholarship Scout</button>
        </main>
      );
    }
    return this.props.children;
  }
}
