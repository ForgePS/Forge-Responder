/**
 * Plain-language notes for building construction types (IBC Types I–V),
 * shown beside each choice on pre-fire plans. Keyed by the option label the
 * department's dropdown saves (e.g. "Type V-B"), so stored answers don't change.
 */
const CONSTRUCTION_TYPES = {
  "type i-a": {
    short: "Fire-resistive, 3-hr frame",
    detail: "Noncombustible and fully protected (3-hour structural frame). High-rises, hospitals. Built to contain fire; watch for contents fires and smoke spread through shafts.",
  },
  "type i-b": {
    short: "Fire-resistive, 2-hr frame",
    detail: "Noncombustible and protected (2-hour structural frame). Mid-rise offices, schools, parking garages.",
  },
  "type ii-a": {
    short: "Noncombustible, protected (1-hr)",
    detail: "Steel or concrete with 1-hour fire protection on the frame. Newer offices and retail.",
  },
  "type ii-b": {
    short: "Noncombustible, unprotected steel",
    detail: "Steel or masonry with no fire rating. Strip malls, warehouses, big-box stores. Unprotected steel and bar-joist roofs can fail early under fire.",
  },
  "type iii-a": {
    short: "Ordinary, protected interior",
    detail: "Masonry exterior walls with a wood interior protected to 1 hour.",
  },
  "type iii-b": {
    short: "Ordinary, unprotected wood interior",
    detail: "Masonry exterior walls with unprotected wood floors and roof. Older main-street buildings. Fire travels through hidden voids and cocklofts; watch for wall collapse.",
  },
  "type iv-a": {
    short: "Mass timber, fully covered",
    detail: "Mass timber fully covered by noncombustible protection (drywall). Tall mass-timber buildings, up to 18 stories.",
  },
  "type iv-b": {
    short: "Mass timber, partly covered",
    detail: "Mass timber with some wood surfaces left exposed. Up to 12 stories.",
  },
  "type iv-c": {
    short: "Mass timber, exposed",
    detail: "Mass timber mostly exposed, with a 2-hour rating. Up to 9 stories.",
  },
  "heavy timber": {
    short: "Large solid wood beams (IV-HT)",
    detail: "Large solid or laminated wood members with masonry exterior walls. Old mills, warehouses and churches. Burns a long time but holds up well; heavy fire load.",
  },
  "type v-a": {
    short: "Wood frame, protected (1-hr)",
    detail: "Wood frame with 1-hour protection (drywall). Apartments, townhomes, newer commercial.",
  },
  "type v-b": {
    short: "Wood frame, unprotected",
    detail: "Wood frame with no fire rating. Most single-family homes. Lightweight trusses and engineered joists can fail quickly in fire.",
  },
  "mixed construction": {
    short: "More than one type",
    detail: "Parts of the building are built differently (for example, an addition). Note which areas are which type.",
  },
  unknown: {
    short: "Not determined yet",
    detail: "Construction type hasn't been confirmed. Verify on the next visit.",
  },
};

function key(label) {
  return String(label || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** The note for a construction type label, or null if it isn't a known type. */
export function constructionTypeInfo(label) {
  return CONSTRUCTION_TYPES[key(label)] || null;
}

/**
 * Explanation for a dropdown option: the option's own description if the
 * department added one, otherwise the built-in note for construction types.
 */
export function dropdownOptionNote(libraryKey, option = {}, detail = false) {
  const own = String(option.description || "").trim();
  if (own) return own;
  if (libraryKey !== "constructionType") return "";
  const info = constructionTypeInfo(option.label || option.value || option.id);
  if (!info) return "";
  return detail ? info.detail : info.short;
}
