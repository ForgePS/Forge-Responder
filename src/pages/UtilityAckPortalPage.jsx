import { useEffect, useState } from "react";
import {
  fetchUtilityAckPortal,
  readUtilityAckToken,
  submitUtilityAckPortal,
} from "../lib/hydrantDamage/utilityAckPortal.js";

function Field({ label, children }) {
  return (
    <label className="config-field" style={{ display: "grid", gap: 6 }}>
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
    <main className="utility-ack-portal" style={{ minHeight: "100vh", padding: "32px 16px", background: "linear-gradient(180deg, #e8f4f2 0%, #f7faf9 40%, #ffffff 100%)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 16 }}>
        <header>
          <p style={{ margin: 0, letterSpacing: "0.08em", textTransform: "uppercase", color: "#145d55", fontWeight: 700, fontSize: 12 }}>
            FORGE RMS
          </p>
          <h1 style={{ margin: "6px 0 0", fontSize: "1.75rem" }}>Hydrant damage acknowledgment</h1>
          <p style={{ margin: "8px 0 0", color: "#475569" }}>
            Secure utility portal. Internal fire-department notes are never shown here.
          </p>
        </header>

        {loading ? <p role="status">Loading report…</p> : null}
        {error ? <p role="alert" style={{ color: "#b91c1c" }}>{error}</p> : null}
        {message ? <p role="status" style={{ color: "#145d55" }}>{message}</p> : null}

        {snapshot ? (
          <section style={{ background: "#fff", border: "1px solid #d5e3df", borderRadius: 12, padding: 20, display: "grid", gap: 12 }}>
            <div>
              <strong>{snapshot.reportNumber}</strong>
              <div style={{ color: "#64748b" }}>{snapshot.statusLabel || snapshot.status}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><div style={{ fontSize: 12, color: "#64748b" }}>Hydrant</div><div>{snapshot.hydrantLabel}</div></div>
              <div><div style={{ fontSize: 12, color: "#64748b" }}>Address</div><div>{snapshot.hydrantAddress || "—"}</div></div>
              <div><div style={{ fontSize: 12, color: "#64748b" }}>Severity</div><div>{snapshot.severityLabel || snapshot.severity}</div></div>
              <div><div style={{ fontSize: 12, color: "#64748b" }}>Operational</div><div>{snapshot.operationalStatusLabel || snapshot.operationalStatus}</div></div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Description</div>
              <div>{snapshot.description || "—"}</div>
            </div>
            {snapshot.utilityFacingNotes ? (
              <div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Utility notes from FD</div>
                <div>{snapshot.utilityFacingNotes}</div>
              </div>
            ) : null}
          </section>
        ) : null}

        {snapshot && !["closed", "cancelled", "verified"].includes(snapshot.status) ? (
          <form onSubmit={handleSubmit} style={{ background: "#fff", border: "1px solid #d5e3df", borderRadius: 12, padding: 20, display: "grid", gap: 12 }}>
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
              style={{
                minHeight: 44,
                border: 0,
                borderRadius: 8,
                background: "#145d55",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {saving ? "Submitting…" : "Submit update"}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
