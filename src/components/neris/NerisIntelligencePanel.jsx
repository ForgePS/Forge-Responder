import { AlertTriangle, CheckCircle2, Cloud, MapPin, Radio, Users, Clock, History } from "lucide-react";
import { countBlockingErrors } from "../../lib/neris/validation.js";
import { statusTone } from "../../lib/neris/workflow.js";

/**
 * @param {{
 *   report: Record<string, unknown>,
 *   completionPercentage: number,
 *   validationIssues: Array<Record<string, unknown>>,
 *   collapsed?: boolean,
 *   onToggleCollapse?: () => void,
 *   occupancyHistory?: Array<Record<string, unknown>>,
 * }} props
 */
export default function NerisIntelligencePanel({
  report = {},
  completionPercentage = 0,
  validationIssues = [],
  collapsed = false,
  onToggleCollapse,
  occupancyHistory = [],
}) {
  const workspace = report.workspace || {};
  const blocking = countBlockingErrors(validationIssues);
  const warnings = validationIssues.filter((i) => !i.blocking).length;
  const cad = workspace.cad || {};
  const weather = workspace.weather?.source === "weather-api-simulated" ? {} : workspace.weather?.dispatchWeather || {};
  const location = workspace.location || {};
  const personnel = workspace.personnel || [];
  const lastApproval = (workspace.approvals || []).slice(-1)[0];

  if (collapsed) {
    return (
      <aside className="neris-intelligence-panel collapsed">
        <button type="button" className="neris-panel-expand" onClick={onToggleCollapse}>
          Intelligence
          <span className={`badge badge-${statusTone(report.status)}`}>{completionPercentage}%</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="neris-intelligence-panel">
      <header>
        <strong>Intelligence</strong>
        {onToggleCollapse ? (
          <button type="button" className="ghost-button" onClick={onToggleCollapse}>Close</button>
        ) : null}
      </header>

      <div className="neris-intel-card">
        <h5>Completion</h5>
        <div className="neris-progress-bar">
          <div className="neris-progress-fill" style={{ width: `${completionPercentage}%` }} />
        </div>
        <div className="neris-intel-stats">
          <span className={`badge badge-${statusTone(report.status)}`}>{report.status || "Draft"}</span>
          <span>{completionPercentage}% complete</span>
        </div>
      </div>

      <div className="neris-intel-card">
        <h5><AlertTriangle size={13} /> Validation</h5>
        {blocking ? (
          <p className="neris-intel-error">{blocking} blocking error{blocking !== 1 ? "s" : ""}</p>
        ) : (
          <p className="neris-intel-success"><CheckCircle2 size={13} /> No blocking errors</p>
        )}
        {warnings ? <p className="neris-intel-warning">{warnings} warning{warnings !== 1 ? "s" : ""}</p> : null}
        <ul className="neris-validation-list">
          {validationIssues.slice(0, 6).map((issue) => (
            <li key={issue.id} className={issue.blocking ? "blocking" : "warning"}>
              {issue.message}
            </li>
          ))}
        </ul>
      </div>

      {cad.incidentNumber || cad.cadCallNumber ? (
        <div className="neris-intel-card">
          <h5><Radio size={13} /> CAD Summary</h5>
          <dl>
            <dt>Call #</dt><dd>{cad.cadCallNumber || cad.incidentNumber}</dd>
            {cad.dispatchTime ? <><dt>Dispatch</dt><dd>{cad.dispatchTime}</dd></> : null}
            {cad.priority ? <><dt>Priority</dt><dd>{cad.priority}</dd></> : null}
          </dl>
        </div>
      ) : null}

      {weather.condition ? (
        <div className="neris-intel-card">
          <h5><Cloud size={13} /> Weather</h5>
          <dl>
            <dt>Condition</dt><dd>{weather.condition}</dd>
            <dt>Temp</dt><dd>{weather.temperature}</dd>
            <dt>Wind</dt><dd>{weather.windSpeed} {weather.windDirection}</dd>
          </dl>
        </div>
      ) : null}

      {location.occupancyName ? (
        <div className="neris-intel-card">
          <h5><MapPin size={13} /> Occupancy</h5>
          <dl>
            <dt>Name</dt><dd>{location.occupancyName}</dd>
            <dt>Use</dt><dd>{location.propertyUse}</dd>
            {location.sprinklerStatus ? <><dt>Sprinkler</dt><dd>{location.sprinklerStatus}</dd></> : null}
            {location.preplanStatus ? <><dt>Preplan</dt><dd>{location.preplanStatus}</dd></> : null}
          </dl>
        </div>
      ) : null}

      {personnel.length ? (
        <div className="neris-intel-card">
          <h5><Users size={13} /> Staffing</h5>
          <p>{personnel.length} personnel attached</p>
          <ul className="neris-staffing-list">
            {personnel.slice(0, 4).map((p, i) => (
              <li key={p.personnelId || i}>{p.rank} {p.name} — {p.unitId}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {lastApproval ? (
        <div className="neris-intel-card">
          <h5><Clock size={13} /> Review Status</h5>
          <p>Last: {lastApproval.action} by {lastApproval.reviewerName}</p>
          {lastApproval.comments ? <small>{lastApproval.comments}</small> : null}
        </div>
      ) : null}

      {occupancyHistory.length ? (
        <div className="neris-intel-card">
          <h5><History size={13} /> Prior Incidents</h5>
          <ul className="neris-history-list">
            {occupancyHistory.slice(0, 5).map((h) => (
              <li key={h.id}>
                <strong>{h.reportNumber}</strong>
                <small>{h.incidentDate} · {h.type}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
