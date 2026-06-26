export function formatActive911AlertLine(alert = {}) {
  const parts = [
    alert.description,
    alert.address,
    alert.city && alert.state ? `${alert.city}, ${alert.state}` : alert.city || alert.state,
    alert.units ? `Units: ${alert.units}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function alertToDashboardMedia(alert = {}, createDigitalDashboardId) {
  const title = alert.description || `Active911 Alert ${alert.id || ""}`.trim();
  return {
    id: createDigitalDashboardId("DDM"),
    title,
    type: "announcement",
    durationSec: 20,
    content: formatActive911AlertLine(alert),
    url: "",
    tags: ["active911", "dispatch"],
    groups: ["Operations"],
    importSource: "active911",
    active911AlertId: alert.id || "",
    createdAt: new Date().toISOString(),
  };
}

export function summarizeActive911Alert(alert = {}) {
  return {
    id: alert.id,
    title: alert.description || "Alert",
    subtitle: [alert.address, alert.city].filter(Boolean).join(", "),
    units: alert.units || "—",
    priority: alert.priority || "—",
    sentAt: alert.sentAt || alert.syncedAt || "",
  };
}
