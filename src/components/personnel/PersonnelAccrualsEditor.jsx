import AdminTextInput from "../AdminTextInput.jsx";
import {
  buildPersonnelAccrualRecord,
  formatAccrualHours,
  normalizePersonnelAccruals,
  summarizePersonnelAccrual,
} from "../../lib/personnelAccruals.js";
import {
  formatPersonnelDateForDisplay,
  formatPersonnelDateForInput,
} from "../../lib/personnelDates.js";
import { MiniTable } from "./PersonnelFieldControls.jsx";

function AccrualSummaryCard({ summary }) {
  return (
    <article className="personnel-accrual-card">
      <header className="personnel-accrual-card-header">
        <strong>{summary.label}</strong>
        <span className="personnel-accrual-balance">{formatAccrualHours(summary.currentBalance)}</span>
      </header>
      <dl className="personnel-accrual-metrics">
        <div><dt>Starting balance</dt><dd>{formatAccrualHours(summary.startingBalance)}</dd></div>
        <div><dt>Biweekly accrual</dt><dd>{formatAccrualHours(summary.biweeklyAccrualRate)}</dd></div>
        <div><dt>Accrued to date</dt><dd>{formatAccrualHours(summary.accrued)}</dd></div>
        <div><dt>Used</dt><dd>{formatAccrualHours(summary.used)}</dd></div>
        <div><dt>Admin adjustment</dt><dd>{formatAccrualHours(summary.adminAdjustment)}</dd></div>
      </dl>
      {summary.adminAdjustmentNote ? (
        <p className="personnel-accrual-note"><strong>Adjustment note:</strong> {summary.adminAdjustmentNote}</p>
      ) : null}
      <p className="personnel-accrual-meta">
        Accrual start: {formatPersonnelDateForDisplay(summary.accrualStartDate, "Not set")}
        {" · "}
        {summary.biweeklyPeriods} biweekly period{summary.biweeklyPeriods === 1 ? "" : "s"} elapsed
      </p>
    </article>
  );
}

function AccrualEditCard({ summary, onChange }) {
  function updateField(field, value) {
    onChange({ [field]: value });
  }

  return (
    <article className="personnel-accrual-card personnel-accrual-card-editing">
      <header className="personnel-accrual-card-header">
        <strong>{summary.label}</strong>
        <span className="personnel-accrual-balance">{formatAccrualHours(summary.currentBalance)} available</span>
      </header>

      <div className="personnel-accrual-edit-grid">
        <label className="admin-field">
          <span>Starting balance (hrs)</span>
          <AdminTextInput
            value={summary.startingBalance}
            onChange={(value) => updateField("startingBalance", value)}
          />
        </label>
        <label className="admin-field">
          <span>Biweekly accrual (hrs)</span>
          <AdminTextInput
            value={summary.biweeklyAccrualRate}
            onChange={(value) => updateField("biweeklyAccrualRate", value)}
          />
        </label>
        <label className="admin-field">
          <span>Accrual start date</span>
          <AdminTextInput
            type="date"
            value={formatPersonnelDateForInput(summary.accrualStartDate)}
            onChange={(value) => updateField("accrualStartDate", value)}
          />
        </label>
        <label className="admin-field">
          <span>Used (hrs)</span>
          <AdminTextInput
            value={summary.used}
            onChange={(value) => updateField("used", value)}
          />
        </label>
        <label className="admin-field">
          <span>Admin adjustment (+/- hrs)</span>
          <AdminTextInput
            value={summary.adminAdjustment}
            onChange={(value) => updateField("adminAdjustment", value)}
          />
        </label>
        <label className="admin-field personnel-accrual-note-field">
          <span>Adjustment note</span>
          <AdminTextInput
            value={summary.adminAdjustmentNote}
            onChange={(value) => updateField("adminAdjustmentNote", value)}
          />
        </label>
      </div>

      <dl className="personnel-accrual-metrics personnel-accrual-metrics-compact">
        <div><dt>Accrued to date</dt><dd>{formatAccrualHours(summary.accrued)}</dd></div>
        <div><dt>Biweekly periods</dt><dd>{summary.biweeklyPeriods}</dd></div>
      </dl>
    </article>
  );
}

export default function PersonnelAccrualsEditor({
  value = [],
  person = {},
  editing = false,
  onChange,
}) {
  const accruals = normalizePersonnelAccruals(value, person);
  const summaries = accruals.map((row) => summarizePersonnelAccrual(row));

  if (!editing) {
    return (
      <div className="personnel-accruals-panel">
        <p className="auth-help personnel-accruals-help">
          Sick and vacation balances accrue every two weeks from each member&apos;s starting balance and biweekly accrual rate.
        </p>
        <div className="personnel-accrual-grid">
          {summaries.map((summary) => (
            <AccrualSummaryCard key={summary.type} summary={summary} />
          ))}
        </div>
        <MiniTable
          columns={["Type", "Starting", "Biweekly", "Accrued", "Used", "Adjustment", "Balance"]}
          rows={summaries.map((summary) => [
            summary.label,
            formatAccrualHours(summary.startingBalance),
            formatAccrualHours(summary.biweeklyAccrualRate),
            formatAccrualHours(summary.accrued),
            formatAccrualHours(summary.used),
            formatAccrualHours(summary.adminAdjustment),
            formatAccrualHours(summary.currentBalance),
          ])}
        />
      </div>
    );
  }

  function updateAccrual(typeId, patch) {
    onChange(
      accruals.map((row) => (
        row.type === typeId
          ? buildPersonnelAccrualRecord({ ...row, ...patch })
          : row
      ))
    );
  }

  return (
    <div className="personnel-accruals-panel">
      <p className="auth-help personnel-accruals-help">
        Set the starting balance and biweekly accrual rate for sick and vacation time. Use admin adjustments to correct balances when needed.
      </p>
      <div className="personnel-accrual-grid">
        {summaries.map((summary) => (
          <AccrualEditCard
            key={summary.type}
            summary={summary}
            onChange={(patch) => updateAccrual(summary.type, patch)}
          />
        ))}
      </div>
    </div>
  );
}
