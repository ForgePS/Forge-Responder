const TONE_BY_STATUS = {
  draft: "neutral",
  scheduled: "info",
  in_progress: "warning",
  awaiting_approval: "warning",
  completed: "success",
  cancelled: "neutral",
  archived: "neutral",
  overdue: "critical",
  open: "critical",
  closed: "success",
  dismissed: "neutral",
  escalated: "critical",
  pass: "success",
  warn: "warning",
  fail: "critical",
  manual: "neutral",
  enabled: "success",
  disabled: "neutral",
  testing: "warning",
  published: "success",
  active: "success",
  paused: "warning",
  queued: "info",
  failed: "critical",
  synced: "success",
  uploaded: "success",
  committed: "success",
  preview: "info",
  recorded: "success",
  issued: "info",
  paid: "success",
  waived: "neutral",
  void: "neutral",
};

function formatStatusLabel(status = "") {
  return String(status || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function InspectionStatusBadge({ status = "", tone } = {}) {
  const key = String(status || "").toLowerCase();
  const resolvedTone = tone || TONE_BY_STATUS[key] || "neutral";
  return (
    <span className={`badge badge-${resolvedTone}`}>
      {formatStatusLabel(status)}
    </span>
  );
}
