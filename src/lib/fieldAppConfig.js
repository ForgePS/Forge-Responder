/**
 * Department settings for the Field App (the in-platform field-tools hub).
 *
 * Everything department-specific comes from the department profile; nothing is
 * bundled. Profile fields read here:
 *   importantNumbers        [{ name, numbers: [{ label, value }] }]
 *   preFirePlanFormUrl      https link to the department's pre-fire plan form
 *   inspectionFormUrl       https link to the department's fire inspection form
 *   fireCodeDocumentBaseUrl https base that serves the department's fire-code
 *                           chapter documents (e.g. "/codes/300 - General Requirements.pdf")
 */

/** Only absolute http(s) URLs are allowed (they are linked and framed). */
export function safeHttpUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** The department's call list, cleaned. Entries without a name or any number are dropped. */
export function resolveImportantNumbers(profile = {}) {
  const list = Array.isArray(profile?.importantNumbers) ? profile.importantNumbers : [];
  return list
    .map((contact) => {
      const name = String(contact?.name ?? "").trim();
      const numbers = (Array.isArray(contact?.numbers) ? contact.numbers : [])
        .map((number) => ({
          label: String(number?.label ?? "").trim() || "Main",
          value: String(number?.value ?? "").trim(),
        }))
        .filter((number) => number.value);
      return { name, numbers };
    })
    .filter((contact) => contact.name && contact.numbers.length);
}

export function resolveFieldAppForms(profile = {}) {
  return {
    preFirePlanFormUrl: safeHttpUrl(profile?.preFirePlanFormUrl),
    inspectionFormUrl: safeHttpUrl(profile?.inspectionFormUrl),
  };
}

/** Base URL for fire-code chapter documents, without a trailing slash; "" when not set. */
export function resolveFireCodeDocumentBase(profile = {}) {
  return safeHttpUrl(profile?.fireCodeDocumentBaseUrl).replace(/\/+$/, "");
}

const SKIP_WORDS = new Set(["of", "the", "and", "&"]);

/** Short badge text for the department, e.g. "Springfield Fire Department" -> "SFD". */
export function departmentInitials(profile = {}) {
  const shortName = String(profile?.shortName ?? "").trim();
  if (shortName && shortName.length <= 6) return shortName.toUpperCase();
  const name = String(profile?.displayTitle || profile?.name || shortName || "").trim();
  const initials = name
    .split(/[\s-]+/)
    .filter((word) => word && !SKIP_WORDS.has(word.toLowerCase()))
    .map((word) => word[0])
    .join("")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 5);
  return initials || "FD";
}
