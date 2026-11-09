// Follow-up questions that open under a preplan answer (e.g. Knox box location
// once a Knox box is marked Present). Added when the form is drawn, so plans
// already pinned to an older template snapshot get them too.

// Knox statuses that mean a box is on site.
export const KNOX_BOX_ON_SITE_VALUES = Object.freeze([
  "Present",
  "Electronic Access",
  "Damaged",
  "Inaccessible",
  "Key Update Required",
]);

const KNOX_SHOW_IF = Object.freeze({ key: "knoxBox", in: KNOX_BOX_ON_SITE_VALUES });

export const PREPLAN_FOLLOW_UP_FIELDS = Object.freeze({
  knoxBox: Object.freeze([
    {
      key: "knoxBoxLocation",
      label: "Knox box location",
      type: "text",
      placeholder: "e.g. Main entrance, right of the door at 6 ft",
      showIf: KNOX_SHOW_IF,
      followUp: true,
    },
    {
      key: "knoxBoxAccessNotes",
      label: "Knox box access instructions",
      type: "long_text",
      placeholder: "Which doors the keys open, alarm panel, elevator keys, anything special",
      showIf: KNOX_SHOW_IF,
      followUp: true,
    },
  ]),
});

const norm = (value) => String(value ?? "").trim().toLowerCase();

/** Whether a field's showIf rule (equals / value / in) matches the current answers. */
export function isPreplanFieldShown(field, answers = {}) {
  const rule = field?.showIf;
  if (!rule?.key) return true;
  const answer = norm(answers?.[rule.key]);
  if (Array.isArray(rule.in)) return rule.in.some((value) => norm(value) === answer);
  const expected = rule.equals ?? rule.value;
  return norm(expected) === answer;
}

/** Insert follow-up fields right after the field they belong to, unless the template already has them. */
export function withPreplanFollowUps(sections = []) {
  if (!Array.isArray(sections)) return [];
  const existing = new Set(sections.flatMap((section) => (section?.fields || []).map((field) => field?.key)));
  return sections.map((section) => {
    const fields = section?.fields || [];
    if (!fields.some((field) => PREPLAN_FOLLOW_UP_FIELDS[field?.key])) return section;
    const next = [];
    for (const field of fields) {
      next.push(field);
      for (const followUp of PREPLAN_FOLLOW_UP_FIELDS[field?.key] || []) {
        if (!existing.has(followUp.key)) next.push(followUp);
      }
    }
    return { ...section, fields: next };
  });
}
