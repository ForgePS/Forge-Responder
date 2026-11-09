/** Saving / success / error line for a settings section. */
export default function SectionStatus({ status }) {
  if (!status) return null;
  if (status.busy) return <p className="hz-section-status" role="status">{status.busyText || "Saving…"}</p>;
  if (status.error) return <div className="error-banner hz-banner" role="alert">{status.error}</div>;
  if (status.message) return <div className="success-banner hz-banner" role="status">{status.message}</div>;
  return null;
}
