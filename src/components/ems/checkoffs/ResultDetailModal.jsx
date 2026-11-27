import { useState } from "react";
import { Modal } from "../../shell/ui.jsx";
import { EQUIPMENT_STATE_LABELS } from "../../../lib/ems/checkoffLogic.js";
import { describeError, signOffCheckoff } from "../../../lib/ems/emsCheckoffService.js";
import { problemText, verificationBadge } from "./ResultsTab.jsx";

/** One recorded check-off: what it found for equipment and supplies, and its sign-off. */
export default function ResultDetailModal({ departmentId, result, uid, canSignOff, onClose, onMessage }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const v = result.verification || {};
  const own = result.operatorUid === uid;
  const equipmentProblems = (result.equipment || []).filter((e) => e.state !== "present" || e.outcome === "skipped");
  const presentCount = (result.equipment || []).length - equipmentProblems.length;

  async function decide(decision) {
    if (decision === "returned" && !note.trim()) {
      setError("Say why it's being sent back.");
      return;
    }
    setBusy(decision);
    setError("");
    try {
      await signOffCheckoff(departmentId, result.id, decision, note.trim());
      onMessage(decision === "verified" ? "Check-off signed off." : "Check-off sent back.");
      onClose();
    } catch (signError) {
      setError(describeError(signError));
    } finally {
      setBusy("");
    }
  }

  return (
    <Modal title={`${result.unitDesignation} · ${result.templateName || "Check-off"}`} onClose={onClose}>
      <div className="ems-result-detail">
        <p>
          Finished {result.completedAt ? new Date(result.completedAt).toLocaleString() : ""} by {result.operatorName}.{" "}
          Result: <strong>{result.result || "Done"}</strong>{result.failedCount ? ` (${result.failedCount} failed item${result.failedCount === 1 ? "" : "s"})` : ""}.{" "}
          EMS problems: {problemText(result)}.
        </p>
        <p>Sign-off: {verificationBadge(result)} {v.byName ? `by ${v.byName}, ${new Date(v.at).toLocaleString()}` : ""}{v.note ? `: ${v.note}` : ""}</p>

        {(result.equipment || []).length ? (
          <section>
            <h3 className="ems-subhead">Equipment</h3>
            <p className="occupancy-muted ems-hint">{presentCount} present and verified.{equipmentProblems.length ? "" : " No problems."}</p>
            {equipmentProblems.length ? (
              <div className="ems-table-wrap">
                <table className="ems-result-table">
                  <thead><tr><th>Equipment</th><th>Answer</th><th>Note</th><th>Recorded</th></tr></thead>
                  <tbody>
                    {equipmentProblems.map((e) => (
                      <tr key={e.equipmentId}>
                        <td>{e.name}{e.assetNumber ? ` (${e.assetNumber})` : ""}</td>
                        <td>{EQUIPMENT_STATE_LABELS[e.state] || e.state}{e.outOfUse ? ", taken out of use" : ""}</td>
                        <td>{e.note || "—"}</td>
                        <td>{e.outcome === "recorded" ? "On the equipment's history" : `Not recorded: ${e.message}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}

        {(result.supplies || []).length ? (
          <section>
            <h3 className="ems-subhead">Supplies</h3>
            <div className="ems-table-wrap">
              <table className="ems-result-table">
                <thead><tr><th>Supply</th><th>Where</th><th>Counted</th><th>Minimum</th><th>On record</th><th>Found</th></tr></thead>
                <tbody>
                  {result.supplies.map((s) => (
                    <tr key={s.balanceId}>
                      <td>{s.itemName}</td>
                      <td>{s.locationName}</td>
                      <td>{s.count}</td>
                      <td>{s.parMin ?? "—"}</td>
                      <td>{s.ledgerOnHand}</td>
                      <td>
                        {[s.out ? "None left" : s.short ? `Short ${s.shortBy}` : "", s.expiredFound ? "Expired stock" : "",
                          s.countDiffers ? "Differs from record" : ""].filter(Boolean).join(", ") || "OK"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.problemCounts?.countsDiffer ? (
              <p className="occupancy-muted ems-hint">Counts that differ from the record don't change stock. Do a physical count in EMS Supply Inventory to correct them.</p>
            ) : null}
          </section>
        ) : null}

        {v.status === "pending" && canSignOff ? (
          own ? (
            <p className="occupancy-muted">Someone else has to sign off a check-off you did.</p>
          ) : (
            <section>
              <label className="config-field">
                <span>Note (needed to send it back)</span>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
              </label>
              {error ? <p className="form-error" role="alert">{error}</p> : null}
              <div className="df-actions">
                <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => decide("returned")}>
                  {busy === "returned" ? "Sending back…" : "Send back"}
                </button>
                <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={() => decide("verified")}>
                  {busy === "verified" ? "Signing off…" : "Sign off"}
                </button>
              </div>
            </section>
          )
        ) : null}
      </div>
    </Modal>
  );
}
