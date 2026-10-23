import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI error boundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="placeholder-page" style={{ margin: 24 }}>
          <h1>Something went wrong</h1>
          <p>{this.state.error.message || "An unexpected error occurred."}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              this.setState({ error: null });
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
