import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI error boundary caught:", error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      const stack = this.state.error?.stack || "";
      const componentStack = this.state.info?.componentStack || "";
      return (
        <section className="placeholder-page" style={{ margin: 24 }}>
          <h1>Something went wrong</h1>
          <p>{this.state.error.message || "An unexpected error occurred."}</p>
          {(stack || componentStack) && (
            <pre
              style={{
                marginTop: 16,
                maxWidth: "100%",
                overflow: "auto",
                textAlign: "left",
                fontSize: 12,
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
                background: "rgba(0,0,0,.35)",
                padding: 12,
                borderRadius: 8,
              }}
            >
              {[stack, componentStack].filter(Boolean).join("\n\n")}
            </pre>
          )}
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              this.setState({ error: null, info: null });
              window.location.reload();
            }}
          >
            Reload page
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
