// Pure helpers for laying out preplan template sections and fields.
// Field keys never change here: saved preplan answers are stored by key.

export const PREPLAN_FIELD_TYPES = [
  { id: "text", label: "Short text" },
  { id: "long_text", label: "Long text" },
  { id: "select", label: "Dropdown" },
];

function moveInList(list, from, to) {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  const target = Math.max(0, Math.min(to, next.length));
  next.splice(target, 0, item);
  return next;
}

/** Move a section from one position to another. */
export function moveSection(sections = [], from, to) {
  return moveInList(sections, from, to);
}

/**
 * Move a field within its section or into another one.
 * `to.index` is the position in the target section after the field is taken out.
 */
export function moveField(sections = [], from, to) {
  const source = sections[from.section];
  const field = source?.fields?.[from.index];
  if (!field || !sections[to.section]) return sections;
  if (from.section === to.section) {
    return sections.map((section, idx) => (
      idx === from.section ? { ...section, fields: moveInList(section.fields || [], from.index, to.index) } : section
    ));
  }
  return sections.map((section, idx) => {
    if (idx === from.section) {
      return { ...section, fields: (section.fields || []).filter((_, i) => i !== from.index) };
    }
    if (idx === to.section) {
      const fields = [...(section.fields || [])];
      fields.splice(Math.max(0, Math.min(to.index, fields.length)), 0, field);
      return { ...section, fields };
    }
    return section;
  });
}

export function updateSection(sections = [], index, patch) {
  return sections.map((section, idx) => (idx === index ? { ...section, ...patch } : section));
}

export function removeSection(sections = [], index) {
  return sections.filter((_, idx) => idx !== index);
}

export function updateField(sections = [], sectionIndex, fieldIndex, patch) {
  return sections.map((section, idx) => (
    idx === sectionIndex
      ? { ...section, fields: (section.fields || []).map((field, i) => (i === fieldIndex ? { ...field, ...patch } : field)) }
      : section
  ));
}

export function removeField(sections = [], sectionIndex, fieldIndex) {
  return sections.map((section, idx) => (
    idx === sectionIndex ? { ...section, fields: (section.fields || []).filter((_, i) => i !== fieldIndex) } : section
  ));
}

function uniqueKey(sections, base) {
  const used = new Set(sections.flatMap((section) => (section.fields || []).map((field) => field.key)));
  let key = base;
  let n = 2;
  while (used.has(key)) key = `${base}_${n++}`;
  return key;
}

/** Add a short-text field at the end of a section, with a key no other field uses. */
export function addField(sections = [], sectionIndex, now = Date.now()) {
  const section = sections[sectionIndex];
  if (!section) return sections;
  const key = uniqueKey(sections, `${section.id || "section"}_${now.toString(36)}`);
  return updateSection(sections, sectionIndex, {
    fields: [...(section.fields || []), { key, label: "New field", type: "text" }],
  });
}

/** New sections go first, under the Add section button. */
export function addSectionAtTop(sections = [], now = Date.now()) {
  const id = `sec-${now.toString(36)}`;
  return [
    { id, title: "New section", fields: [{ key: `${id}_notes`, label: "Notes", type: "long_text" }] },
    ...sections,
  ];
}
