/**
 * Reference material for the EMS and HazMat quick cards (pure, unit tested).
 */

/** Which reference card a department document belongs to: "ems", "hazmat" or "". */
export function referenceKind(doc = {}) {
  const category = String(doc.category || doc.type || "").toLowerCase();
  const words = `${doc.title || ""} ${doc.category || ""} ${doc.tags || ""}`.toLowerCase();
  if (/haz\s*-?\s*mat|hazardous materials/.test(words)) return "hazmat";
  if (category === "ems protocol" || category === "ems protocols") return "ems";
  return "";
}

/** Public HazMat references (need signal). */
export const HAZMAT_LINKS = [
  {
    key: "erg",
    title: "Emergency Response Guidebook (ERG)",
    detail: "PHMSA · look up by UN/NA number or name",
    url: "https://www.phmsa.dot.gov/hazmat/erg/emergency-response-guidebook-erg",
  },
  {
    key: "cameo",
    title: "CAMEO Chemicals",
    detail: "NOAA · chemical datasheets and reactivity",
    url: "https://cameochemicals.noaa.gov/",
  },
  {
    key: "niosh",
    title: "NIOSH Pocket Guide",
    detail: "CDC · exposure limits and PPE",
    url: "https://www.cdc.gov/niosh/npg/",
  },
];

export const PILL_IDENTIFIER_URL = "https://www.drugs.com/imprints.php";
