/**
 * EMS agency settings (departments/{id}/settings/ems), edited by admins on the RMS Patient Care Reports page.
 * They fill the NEMSIS export header (dAgency.01/.02/.04) and prefill new reports (eResponse.01/.02).
 * The server (functions/lib/nemsis/pcrCheck.js agencyFromSettings) reads the same fields.
 *
 * { stateAgencyId, agencyNumber, agencyName, state, updatedAt, updatedBy }
 */

export const EMS_SETTINGS_DOC = "ems";

const text = (value) => String(value ?? "").trim();

export function normalizeEmsSettings(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    stateAgencyId: text(data.stateAgencyId),
    agencyNumber: text(data.agencyNumber),
    agencyName: text(data.agencyName),
    // dAgency.04 is the state's ANSI (FIPS) code, e.g. "37" for North Carolina.
    state: text(data.state),
  };
}

/** The DemographicGroup the export header needs. */
export function emsSettingsAgency(settings) {
  const s = normalizeEmsSettings(settings);
  return { "dAgency.01": s.stateAgencyId, "dAgency.02": s.agencyNumber, "dAgency.04": s.state };
}

/** Labels of the export header fields that are still blank. */
export function missingEmsSettings(settings) {
  const s = normalizeEmsSettings(settings);
  return [
    !s.stateAgencyId && "EMS agency unique state ID",
    !s.agencyNumber && "EMS agency number",
    !s.state && "EMS agency state",
  ].filter(Boolean);
}

/** Errors shown before saving. */
export function emsSettingsErrors(settings) {
  const s = normalizeEmsSettings(settings);
  const errors = {};
  if (s.state && !/^\d{2}$/.test(s.state)) errors.state = "Use the two-digit state code (e.g. 37 for North Carolina).";
  if (s.agencyNumber.length > 15) errors.agencyNumber = "NEMSIS allows at most 15 characters.";
  if (s.stateAgencyId.length > 50) errors.stateAgencyId = "NEMSIS allows at most 50 characters.";
  return errors;
}
