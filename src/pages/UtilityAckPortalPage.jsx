import { useEffect, useState } from "react";
import {
  fetchUtilityAckPortal,
  readUtilityAckToken,
  submitUtilityAckPortal,
} from "../lib/hydrantDamage/utilityAckPortal.js";
import "../styles/utility-ack-portal.css";

function Field({ label, children }) {
  return (
    <label className="utility-ack-portal__field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function UtilityAckPortalPage() {
  const [token] = useState(() => readUtilityAckToken());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [form, setForm] = useState({
    acknowledgedByName: "",
    acknowledgedByEmail: "",
    utilityWorkOrderNumber: "",
    estimatedRepairAt: "",
    utilityNotes: "",
    action: "acknowledge",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setError("Missing acknowledgment token. Open the secure link from the damage report email.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const data = await fetchUtilityAckPortal(token);
        if (cancelled) return;
        if (!data?.ok) {
          setError(data?.error || "Unable to open this acknowledgment link.");
          setSnapshot(null);
        } else {
          setSnapshot(data.report);
          setForm((current) => ({
            ...current,
            utilityWorkOrderNumber: data.report?.utilityWorkOrderNumber || "",
          }));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError?.message || "Unable to load acknowledgment portal.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await submitUtilityAckPortal(token, form);
      if (!result?.ok) {
        throw new Error(result?.error || "Submission failed.");
      }
      setSnapshot(result.report || snapshot);
      setMessage(result.message || "Update submitted. Thank you.");
    } catch (submitError) {
      setError(submitError?.message || "Unable to submit update.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="utility-ack-portal">
      <div className="utility-ack-portal__inner">
        <header>
          <p className="utility-ack-portal__eyebrow">
            FORGE RMS
          </p>
          <h1 className="utility-ack-portal__title">Hydrant damage acknowledgment</h1>
          <p className="utility-ack-portal__lead">
            Secure utility portal. Internal fire-department notes are never shown here.
          </p>
        </header>

        {loading ? <p role="status">Loading report…</p> : null}
        {error ? <p role="alert" className="utility-ack-portal__error">{error}</p> : null}
        {message ? <p role="status" className="utility-ack-portal__success">{message}</p> : null}

        {snapshot ? (
          <section className="utility-ack-portal__card">
            <div>
              <strong>{snapshot.reportNumber}</strong>
              <div className="utility-ack-portal__muted">{snapshot.statusLabel || snapshot.status}</div>
            </div>
            <div className="utility-ack-portal__facts">
              <div><div className="utility-ack-portal__fact-label">Hydrant</div><div>{snapshot.hydrantLabel}</div></div>
              <div><div className="utility-ack-portal__fact-label">Address</div><div>{snapshot.hydrantAddress || "—"}</div></div>
              <div><div className="utility-ack-portal__fact-label">Severity</div><div>{snapshot.severityLabel || snapshot.severity}</div></div>
              <div><div className="utility-ack-portal__fact-label">Operational</div><div>{snapshot.operationalStatusLabel || snapshot.operationalStatus}</div></div>
            </div>
            <div>
              <div className="utility-ack-portal__fact-label">Description</div>
              <div>{snapshot.description || "—"}</div>
            </div>
            {snapshot.utilityFacingNotes ? (
              <div>
                <div className="utility-ack-portal__fact-label">Utility notes from FD</div>
                <div>{snapshot.utilityFacingNotes}</div>
              </div>
            ) : null}
          </section>
        ) : null}

        {snapshot && !["closed", "cancelled", "verified"].includes(snapshot.status) ? (
          <form onSubmit={handleSubmit} className="utility-ack-portal__card">
            <Field label="Action">
              <select
                value={form.action}
                onChange={(e) => setForm((c) => ({ ...c, action: e.target.value }))}
              >
                <option value="acknowledge">Acknowledge report</option>
                <option value="scheduled">Mark repair scheduled</option>
                <option value="in_progress">Mark repair in progress</option>
                <option value="completed">Mark repair completed (FD will verify)</option>
              </select>
            </Field>
            <Field label="Your name">
              <input
                required={form.action === "acknowledge"}
                value={form.acknowledgedByName}
                onChange={(e) => setForm((c) => ({ ...c, acknowledgedByName: e.target.value }))}
              />
            </Field>
            <Field label="Your email">
              <input
                type="email"
                value={form.acknowledgedByEmail}
                onChange={(e) => setForm((c) => ({ ...c, acknowledgedByEmail: e.target.value }))}
              />
            </Field>
            <Field label="Work order number">
              <input
                value={form.utilityWorkOrderNumber}
                onChange={(e) => setForm((c) => ({ ...c, utilityWorkOrderNumber: e.target.value }))}
              />
            </Field>
            <Field label="Estimated repair completion">
              <input
                type="datetime-local"
                value={(form.estimatedRepairAt || "").slice(0, 16)}
                onChange={(e) => setForm((c) => ({
                  ...c,
                  estimatedRepairAt: e.target.value ? new Date(e.target.value).toISOString() : "",
                }))}
              />
            </Field>
            <Field label="Notes for the fire department">
              <textarea
                rows={4}
                value={form.utilityNotes}
                onChange={(e) => setForm((c) => ({ ...c, utilityNotes: e.target.value }))}
              />
            </Field>
            <button
              type="submit"
              disabled={saving}
              className="utility-ack-portal__submit"
            >
              {saving ? "Submitting…" : "Submit update"}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
