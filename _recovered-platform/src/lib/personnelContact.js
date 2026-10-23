export function formatUsPhone(value = "") {
  const digits = String(value).replace(/\D/g, "").slice(0, 10);
  if (!digits.length) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export const EMERGENCY_CONTACT_PREFIXES = ["emergency", "emergency2"];

export const PERSONNEL_PHONE_FIELDS = new Set(["phone", "emergencyPhone", "emergency2Phone"]);

export function emergencyContactFieldKey(prefix = "emergency", suffix = "") {
  return `${prefix}${suffix}`;
}

export function employeeAddressFields(person = {}) {
  return {
    address: person.address ?? "",
    city: person.city ?? "",
    state: person.state ?? "",
    zip: person.zip ?? "",
  };
}

export function emergencyAddressFields(person = {}, prefix = "emergency") {
  return {
    [emergencyContactFieldKey(prefix, "Address")]: person[emergencyContactFieldKey(prefix, "Address")] ?? "",
    [emergencyContactFieldKey(prefix, "City")]: person[emergencyContactFieldKey(prefix, "City")] ?? "",
    [emergencyContactFieldKey(prefix, "State")]: person[emergencyContactFieldKey(prefix, "State")] ?? "",
    [emergencyContactFieldKey(prefix, "Zip")]: person[emergencyContactFieldKey(prefix, "Zip")] ?? "",
  };
}

export function copyEmployeeAddressToEmergency(person = {}, prefix = "emergency") {
  const employee = employeeAddressFields(person);
  return {
    [emergencyContactFieldKey(prefix, "Address")]: employee.address,
    [emergencyContactFieldKey(prefix, "City")]: employee.city,
    [emergencyContactFieldKey(prefix, "State")]: employee.state,
    [emergencyContactFieldKey(prefix, "Zip")]: employee.zip,
  };
}

function parseLegacyEmergencyNamePhone(emergency = "") {
  const text = String(emergency || "").trim();
  if (!text) {
    return {
      emergencyFirstName: "",
      emergencyLastName: "",
      emergencyPhone: "",
    };
  }

  const parts = text.split("·").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const nameParts = parts[0].split(/\s+/).filter(Boolean);
    return {
      emergencyFirstName: nameParts[0] || "",
      emergencyLastName: nameParts.slice(1).join(" "),
      emergencyPhone: formatUsPhone(parts[1]),
    };
  }

  const phoneMatch = text.match(/\(?\d{3}\)?[^\d]*\d{3}[^\d]*\d{4}/);
  if (phoneMatch) {
    const phone = formatUsPhone(phoneMatch[0]);
    const name = text.replace(phoneMatch[0], "").replace(/[·|,]/g, " ").trim();
    const nameParts = name.split(/\s+/).filter(Boolean);
    return {
      emergencyFirstName: nameParts[0] || "",
      emergencyLastName: nameParts.slice(1).join(" "),
      emergencyPhone: phone,
    };
  }

  const nameParts = text.split(/\s+/).filter(Boolean);
  return {
    emergencyFirstName: nameParts[0] || "",
    emergencyLastName: nameParts.slice(1).join(" "),
    emergencyPhone: "",
  };
}

export function normalizeEmergencyContactFields(person = {}, prefix = "emergency", legacyEmergency = "") {
  const legacy = prefix === "emergency" ? parseLegacyEmergencyNamePhone(legacyEmergency || person.emergency) : {};
  const sameAddressKey = emergencyContactFieldKey(prefix, "SameAddress");
  const sameAddress = Boolean(person[sameAddressKey]);

  const normalized = {
    [emergencyContactFieldKey(prefix, "FirstName")]: person[emergencyContactFieldKey(prefix, "FirstName")]
      ?? (prefix === "emergency" ? legacy.emergencyFirstName : "") ?? "",
    [emergencyContactFieldKey(prefix, "LastName")]: person[emergencyContactFieldKey(prefix, "LastName")]
      ?? (prefix === "emergency" ? legacy.emergencyLastName : "") ?? "",
    [emergencyContactFieldKey(prefix, "Phone")]: formatUsPhone(
      person[emergencyContactFieldKey(prefix, "Phone")]
        ?? (prefix === "emergency" ? legacy.emergencyPhone : "")
        ?? ""
    ),
    [emergencyContactFieldKey(prefix, "Relationship")]: person[emergencyContactFieldKey(prefix, "Relationship")] ?? "",
    [emergencyContactFieldKey(prefix, "Address")]: person[emergencyContactFieldKey(prefix, "Address")] ?? "",
    [emergencyContactFieldKey(prefix, "City")]: person[emergencyContactFieldKey(prefix, "City")] ?? "",
    [emergencyContactFieldKey(prefix, "State")]: person[emergencyContactFieldKey(prefix, "State")] ?? "",
    [emergencyContactFieldKey(prefix, "Zip")]: person[emergencyContactFieldKey(prefix, "Zip")] ?? "",
    [sameAddressKey]: sameAddress,
  };

  if (sameAddress) {
    Object.assign(normalized, copyEmployeeAddressToEmergency(person, prefix));
  }

  return normalized;
}

export function normalizeAllEmergencyContactFields(person = {}) {
  return EMERGENCY_CONTACT_PREFIXES.reduce(
    (accumulator, prefix) => ({
      ...accumulator,
      ...normalizeEmergencyContactFields(person, prefix, person.emergency),
    }),
    {}
  );
}

export function formatEmergencyContactSummary(person = {}, prefix = "emergency") {
  const name = [
    person[emergencyContactFieldKey(prefix, "FirstName")],
    person[emergencyContactFieldKey(prefix, "LastName")],
  ].filter(Boolean).join(" ").trim();
  const relationship = String(person[emergencyContactFieldKey(prefix, "Relationship")] || "").trim();
  const phone = person[emergencyContactFieldKey(prefix, "Phone")] || "";
  const nameWithRelationship = relationship
    ? (name ? `${name} (${relationship})` : relationship)
    : name;
  if (nameWithRelationship && phone) return `${nameWithRelationship} · ${phone}`;
  return nameWithRelationship || phone || "";
}

export function formatEmergencyContactSummaryAll(person = {}) {
  const summaries = EMERGENCY_CONTACT_PREFIXES
    .map((prefix) => formatEmergencyContactSummary(person, prefix))
    .filter(Boolean);
  return summaries.join(" | ");
}
