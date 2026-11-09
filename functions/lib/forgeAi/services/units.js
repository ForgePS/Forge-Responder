/**
 * Unit & Resource Intelligence: fleet readiness as maintained in Fleet, and
 * unit activity as recorded on NERIS reports. There is no AVL or CAD unit
 * status feed, so nothing here is a live dispatch status.
 */
const R = require("../records");
const { parseToUtcMs } = require("../../heatZone/time");
const { normalUnit } = require("../query");
const { filterRows } = require("./incident");

const READINESS_LABELS = {
  available: "Available",
  available_restricted: "Available (restricted)",
  out_of_service: "Out of service",
  in_shop: "In shop",
  maintenance_due: "Maintenance due",
  reserve: "Reserve",
  decommissioned: "Decommissioned",
};
const STATUS_LABELS = { in_service: "In service", out_of_service: "Out of service", restricted: "Restricted", reserve: "Reserve", decommissioned: "Decommissioned" };

function unitName(asset) {
  return R.text(asset.unitDesignation || asset.radioDesignation || asset.fleetNumber || asset.name || asset.id, 40);
}

function readinessOf(asset) {
  return READINESS_LABELS[asset.readinessState] || STATUS_LABELS[asset.status] || R.text(asset.statusLabel || asset.status, 40) || "Unknown";
}

function restrictionText(asset) {
  const r = asset.activeRestriction;
  if (!r) return "";
  if (typeof r === "string") return R.scrubFreeText(r, 120);
  return R.scrubFreeText(r.summary || r.reason || r.description || "", 120);
}

function activity(rows, timeZone) {
  const byUnit = new Map();
  for (const row of rows) {
    for (const unit of R.unitsOf(row.report)) {
      const id = normalUnit(unit.unitId);
      if (!id) continue;
      const entry = byUnit.get(id) || { unit: R.text(unit.unitId, 30), incidents: 0, responseSamples: [], lastOccurred: 0 };
      entry.incidents += 1;
      const d = parseToUtcMs(unit.dispatchTime, timeZone);
      const a = parseToUtcMs(unit.arrivalTime, timeZone);
      if (d !== null && a !== null && a > d && a - d < 3 * 3600_000) entry.responseSamples.push((a - d) / 1000);
      if ((row.p?.occurredAt || 0) > entry.lastOccurred) entry.lastOccurred = row.p.occurredAt;
      byUnit.set(id, entry);
    }
  }
  return [...byUnit.entries()].map(([key, e]) => ({
    key,
    unit: e.unit,
    incidents: e.incidents,
    averageResponseMinutes: e.responseSamples.length >= 3 ? R.minutes(e.responseSamples.reduce((s, v) => s + v, 0) / e.responseSamples.length) : null,
    responseSample: e.responseSamples.length,
    lastIncident: R.formatLocal(e.lastOccurred, timeZone),
  })).sort((a, b) => b.incidents - a.incidents || a.unit.localeCompare(b.unit));
}

async function run(ctx) {
  const book = ctx.book || new R.SourceBook();
  const q = ctx.query;
  const [{ assets, apparatus }, { rows }] = await Promise.all([
    R.loadFleet(ctx.db, ctx.departmentId),
    R.loadReports(ctx.db, ctx.departmentId, ctx.timeZone),
  ]);
  const wanted = new Set(q.units);
  const fleet = assets
    .filter((a) => !wanted.size || wanted.has(normalUnit(unitName(a))))
    .map((a) => {
      const source = book.add({ kind: "fleetAsset", recordId: a.id, label: `Unit ${unitName(a)}`, detail: `${readinessOf(a)}${a.station ? ` · ${R.text(a.station, 40)}` : ""}`, liveness: "current", asOf: R.text(a.updatedAt || a.lastCheckAt, 40) || null, link: { page: "Readiness Board" } });
      return {
        source,
        unit: unitName(a),
        type: R.text(a.type || a.category, 40),
        station: R.text(a.station, 40),
        readiness: readinessOf(a),
        restriction: restrictionText(a) || undefined,
        lastCheck: R.text(a.lastCheckAt, 40) || undefined,
        lastCheckResult: R.text(a.lastCheckResult, 40) || undefined,
      };
    });
  // Units only on the classic apparatus list (no fleet asset yet).
  const known = new Set(fleet.map((f) => normalUnit(f.unit)));
  const classic = apparatus
    .filter((u) => !known.has(normalUnit(u.unit || u.id)) && (!wanted.size || wanted.has(normalUnit(u.unit || u.id))))
    .slice(0, 50)
    .map((u) => ({
      source: book.add({ kind: "apparatus", recordId: R.text(u.id || u.unit, 60), label: `Unit ${R.text(u.unit || u.id, 30)}`, detail: R.text(u.status, 40), liveness: "current", asOf: null, link: { page: "Apparatus" } }),
      unit: R.text(u.unit || u.id, 30), type: R.text(u.type, 40), station: R.text(u.station, 40), readiness: R.text(u.status, 40) || "Unknown",
    }));

  const windowRows = filterRows(rows, { ...ctx, query: { ...q, units: [] } });
  const unitActivity = activity(windowRows, ctx.timeZone).filter((u) => !wanted.size || wanted.has(u.key));
  const counts = {};
  for (const f of [...fleet, ...classic]) counts[f.readiness] = (counts[f.readiness] || 0) + 1;

  const facts = {
    window: { from: q.window.from, to: q.window.to, label: q.window.label },
    readinessCounts: Object.entries(counts).map(([status, count]) => ({ status, count })),
    units: [...fleet, ...classic],
    activity: unitActivity.slice(0, 40).map(({ key, ...rest }) => rest),
  };
  const notReady = [...fleet, ...classic].filter((u) => !/^(available|in service)/i.test(u.readiness));
  const lines = [];
  if (fleet.length || classic.length) {
    lines.push(`**${fleet.length + classic.length}** unit(s) on record: ${facts.readinessCounts.map((c) => `${c.status} ${c.count}`).join(", ")}.`);
    if (notReady.length) lines.push(`- Not fully available: ${notReady.slice(0, 10).map((u) => `${u.unit} — ${u.readiness} [${u.source}]`).join("; ")}`);
  } else {
    lines.push("No units are recorded in Fleet or the apparatus list.");
  }
  if (unitActivity.length) lines.push(`- Busiest on reports (${q.window.label}): ${unitActivity.slice(0, 5).map((u) => `${u.unit} ${u.incidents}`).join(", ")}`);

  return {
    capability: "units",
    title: wanted.size ? `Units ${[...wanted].join(", ")}` : "Units and resources",
    liveness: "mixed",
    facts,
    book,
    tables: [
      { id: "readiness", title: "Readiness (as maintained in Fleet)", columns: ["Unit", "Type", "Station", "Readiness", "Restriction", "Last check"], rows: facts.units.map((u) => [u.unit, u.type, u.station, u.readiness, u.restriction || "", u.lastCheck || ""]) },
      { id: "activity", title: `Unit activity on reports — ${q.window.label}`, columns: ["Unit", "Incidents", "Avg response (min)", "Last incident"], rows: facts.activity.map((u) => [u.unit, u.incidents, u.averageResponseMinutes ?? "", u.lastIncident]) },
    ].filter((t) => t.rows.length),
    limitations: [
      "Readiness is the status kept in Fleet, not a live dispatch or AVL status (no CAD/AVL feed is connected).",
      "Unit activity counts only incidents recorded on NERIS reports.",
    ],
    fallbackAnswer: lines.join("\n"),
    empty: !fleet.length && !classic.length && !unitActivity.length,
  };
}

module.exports = { run, activity, readinessOf, unitName };
