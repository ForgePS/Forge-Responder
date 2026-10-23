export const APPARATUS_UNASSIGNED_STATION = "Unassigned";

export function isApparatusStationUnassigned(station = "") {
  const value = String(station || "").trim();
  return !value || /^unassigned$/i.test(value);
}

export function sortApparatusUnits(units = []) {
  return [...units].sort((a, b) => {
    const nameA = String(a.unit || a.id || "").trim();
    const nameB = String(b.unit || b.id || "").trim();
    return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
  });
}

export function groupApparatusByStation(units = [], stationNames = []) {
  const configured = [...new Set(
    (stationNames || []).map((name) => String(name || "").trim()).filter(Boolean),
  )];

  const byStation = new Map();
  const unassigned = [];

  configured.forEach((station) => byStation.set(station, []));

  (units || []).forEach((unit) => {
    if (isApparatusStationUnassigned(unit.station)) {
      unassigned.push(unit);
      return;
    }
    const station = String(unit.station).trim();
    if (!byStation.has(station)) {
      byStation.set(station, []);
    }
    byStation.get(station).push(unit);
  });

  const groups = configured.map((station) => ({
    station,
    units: sortApparatusUnits(byStation.get(station) || []),
  }));

  [...byStation.keys()]
    .filter((name) => !configured.includes(name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .forEach((station) => {
      groups.push({
        station,
        units: sortApparatusUnits(byStation.get(station) || []),
      });
    });

  if (unassigned.length) {
    groups.push({
      station: APPARATUS_UNASSIGNED_STATION,
      units: sortApparatusUnits(unassigned),
    });
  }

  return groups;
}
