import { buildAlertDashboardUrl } from "../../lib/alertDashboard.js";
import DisplayAlertUrlField from "./DisplayAlertUrlField.jsx";

const STEPS = [
  "Register each wall monitor or MVIX player in Devices (assign the station for route origin).",
  "Copy the alert display URL for that device (each URL includes ?display= so routes start from the right station).",
  "On the MVIX player, Amazon Signage Stick, or kiosk browser, set that URL as the home / startup page.",
  "Disable sleep and screensaver so the display stays on the alert dashboard.",
  "In Alert Dashboard settings, click Save once and save Google APIs so maps load on active dispatches.",
  "Use Push test alert to verify takeover on the wall before going live with Active911.",
];

export default function MvixProvisioningGuide({
  gatewaySlug = "",
  displays = [],
  displayKey = "",
}) {
  const departmentUrl = gatewaySlug ? buildAlertDashboardUrl(gatewaySlug, "", displayKey) : "";

  return (
    <section className="dd-mvix-guide">
      <h4>Connect MVIX / signage players</h4>
      <p className="dd-empty-detail">
        Forge Digital Dashboard replaces MVIX for alert takeover. Point each player at its alert URL — no MVIX license required for dispatch displays.
      </p>
      <ol className="dd-mvix-steps">
        {STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {departmentUrl ? (
        <DisplayAlertUrlField
          url={departmentUrl}
          label="Department alert URL (any station — uses first registered display station for routes)"
          compact
        />
      ) : null}
      {displays.length ? (
        <div className="dd-mvix-device-urls">
          <p className="dd-display-url-label">Per-device URLs (recommended for MVIX)</p>
          <ul>
            {displays.map((display) => (
              <li key={display.id}>
                <strong>{display.name || display.id}</strong>
                {display.station ? ` · ${display.station}` : ""}
                <DisplayAlertUrlField
                  url={gatewaySlug ? buildAlertDashboardUrl(gatewaySlug, display.id, displayKey) : ""}
                  label=""
                  compact
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="dd-gallery-note">Add devices under Devices to get copy-ready MVIX URLs for each screen.</p>
      )}
    </section>
  );
}
