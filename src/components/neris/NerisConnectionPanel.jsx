import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, LoaderCircle, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  NERIS_STATUS_LABELS,
  getNerisConnection,
  isValidNerisId,
  normalizeNerisId,
  removeNerisConnection,
  saveNerisConnection,
  testNerisConnection,
} from "../../lib/nerisConnectionService.js";
import NerisSyncSection from "./NerisSyncSection.jsx";
import "../../theme/digital-dashboard.css";

function formatWhen(iso = "") {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

/**
 * Connects a department to NERIS. The department's NERIS admin enrolls FORGE's
 * client ID in the NERIS portal; then an admin here saves the NERIS ID and
 * FORGE checks that NERIS accepts it.
 */
export default function NerisConnectionPanel({ departmentId = "", canConfigure = false, readOnlyNote = "" }) {
  const [status, setStatus] = useState(null);
  const [nerisIdInput, setNerisIdInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!departmentId) return undefined;
    let active = true;
    setLoading(true);
    getNerisConnection(departmentId)
      .then((next) => {
        if (!active) return;
        setStatus(next);
        setNerisIdInput(next?.nerisId || "");
      })
      .catch((err) => { if (active) setError(err.message || "Couldn't load the NERIS connection."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [departmentId]);

  async function run(kind, action) {
    setBusy(kind);
    setError("");
    try {
      const next = await action();
      setStatus(next);
      setNerisIdInput(next?.nerisId || "");
    } catch (err) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }

  function handleSave(event) {
    event.preventDefault();
    const id = normalizeNerisId(nerisIdInput);
    if (!isValidNerisId(id)) {
      setError("That doesn't look like a NERIS ID. It starts with two letters and five digits, like FD24027214.");
      return;
    }
    run("save", () => saveNerisConnection(departmentId, id));
  }

  function handleRemove() {
    if (!window.confirm("Remove this department's NERIS ID from FORGE? This doesn't remove FORGE's enrollment in NERIS. Do that under Enrollments in the NERIS portal.")) return;
    run("remove", () => removeNerisConnection(departmentId));
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(status?.clientId || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the client ID and copy it by hand.");
    }
  }

  const state = status?.status || "not_set_up";
  const pill = NERIS_STATUS_LABELS[state] || NERIS_STATUS_LABELS.not_set_up;
  const savedId = status?.nerisId || "";
  const idChanged = normalizeNerisId(nerisIdInput) !== savedId;

  return (
    <section className="dd-panel neris-connection-panel">
      <div className="dd-panel-head">
        <div>
          <h3>NERIS reporting</h3>
          <p className="dd-panel-subtitle">
            Lets FORGE send this department's incident reports to NERIS.
          </p>
        </div>
        {loading ? null : <span className={`dd-status-pill dd-status-${pill.tone}`}>{pill.label}</span>}
      </div>

      <div className="dd-panel-body">
        {loading ? (
          <p className="dd-empty-detail"><LoaderCircle size={16} className="dd-spin" /> Loading NERIS connection…</p>
        ) : (
          <>
            {status?.environment === "test" ? (
              <p className="neris-connection-env">Using the NERIS test sandbox. Nothing sent here counts as an official report.</p>
            ) : null}

            {state === "connected" ? (
              <p className="neris-connection-result is-ok">
                <Check size={16} aria-hidden="true" />
                <span>
                  Connected to <strong>{status.entityName || "your department"}</strong> ({savedId})
                  {status.lastCheckedAt ? ` · checked ${formatWhen(status.lastCheckedAt)}` : ""}
                </span>
              </p>
            ) : null}
            {status?.configured && state !== "connected" && status.lastError ? (
              <p className="neris-connection-result is-problem">{status.lastError}</p>
            ) : null}
            {status?.environmentMismatch ? (
              <p className="neris-connection-result is-problem">
                This was last checked against a different NERIS environment. Test the connection again.
              </p>
            ) : null}

            {!canConfigure ? (
              <p className="dd-empty-detail">
                {status?.configured ? `NERIS ID ${savedId}. ` : ""}
                {readOnlyNote || (status?.configured
                  ? "A department administrator manages this connection."
                  : "A department administrator sets up the NERIS connection.")}
              </p>
            ) : (
              <>
                <div className="neris-connection-step">
                  <h4>Step 1: Enroll FORGE in NERIS</h4>
                  {status?.clientId ? (
                    <>
                      <p className="dd-google-api-hint">A NERIS admin for your department does this once, in the NERIS portal:</p>
                      <ol className="neris-connection-steps">
                        <li>Log in to NERIS with an admin account.</li>
                        <li>Select <strong>Enrollments</strong> from the left menu.</li>
                        <li>Paste FORGE's client ID below into the <strong>Client ID</strong> field (not your NERIS ID).</li>
                        <li>Select <strong>Enroll Integration</strong>, check the permissions, then select <strong>Enroll</strong>.</li>
                      </ol>
                      <div className="neris-connection-client-id">
                        <code>{status.clientId}</code>
                        <button type="button" className="dd-action-button compact" onClick={handleCopy}>
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                          {copied ? "Copied" : "Copy client ID"}
                        </button>
                      </div>
                      {status.enrollmentGuideUrl ? (
                        <a className="neris-connection-guide" href={status.enrollmentGuideUrl} target="_blank" rel="noreferrer">
                          NERIS enrollment guide (PDF) <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      ) : null}
                    </>
                  ) : (
                    <p className="dd-upload-error">
                      FORGE's NERIS client ID isn't set up yet. Contact FORGE Public Safety.
                    </p>
                  )}
                </div>

                <form className="neris-connection-step" onSubmit={handleSave}>
                  <h4>Step 2: Enter your NERIS ID</h4>
                  <div className="dd-google-api-field">
                    <label htmlFor="neris-id-input">Department NERIS ID</label>
                    <input
                      id="neris-id-input"
                      value={nerisIdInput}
                      onChange={(event) => setNerisIdInput(event.target.value)}
                      placeholder="FD24027214"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <p className="dd-google-api-hint">Shown on your department's NERIS account. Starts with two letters, like FD.</p>
                  </div>
                  <div className="dd-google-api-actions">
                    <button type="submit" className="dd-action-button primary" disabled={Boolean(busy) || !nerisIdInput.trim() || (!idChanged && state === "connected")}>
                      {busy === "save" ? <LoaderCircle size={16} className="dd-spin" /> : <Save size={16} />}
                      Save and test
                    </button>
                    {savedId ? (
                      <button type="button" className="dd-action-button" disabled={Boolean(busy)} onClick={() => run("test", () => testNerisConnection(departmentId))}>
                        {busy === "test" ? <LoaderCircle size={16} className="dd-spin" /> : <RefreshCw size={16} />}
                        Test connection
                      </button>
                    ) : null}
                    {savedId ? (
                      <button type="button" className="dd-action-button danger" disabled={Boolean(busy)} onClick={handleRemove}>
                        <Trash2 size={16} />
                        Remove
                      </button>
                    ) : null}
                  </div>
                </form>

                {state === "connected" && !status?.environmentMismatch ? (
                  <NerisSyncSection departmentId={departmentId} />
                ) : null}
              </>
            )}
          </>
        )}

        {error ? <p className="dd-upload-error">{error}</p> : null}
      </div>
    </section>
  );
}
