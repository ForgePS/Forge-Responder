export const DEFAULT_SHIFT_COLORS = {
  "A Shift": "#000000",
  "B Shift": "#22c55e",
  "C Shift": "#ef4444",
};

export const ROTATION_PRESETS = {
  "24/48-abc": {
    label: "24/48 — A / B / C",
    description: "Three-platoon rotation. Each shift works one day, off two.",
    sequence: ["A Shift", "B Shift", "C Shift"],
  },
  "24/48-ab": {
    label: "24/48 — A / B",
    description: "Two-platoon rotation alternating daily.",
    sequence: ["A Shift", "B Shift"],
  },
  custom: {
    label: "Custom sequence",
    description: "Define your own repeating day-by-day pattern.",
    sequence: [],
  },
};

export const defaultShiftRotation = {
  preset: "24/48-abc",
  anchorDate: "2026-06-07",
  anchorShift: "A Shift",
  sequence: ["A Shift", "B Shift", "C Shift"],
  shiftColors: { ...DEFAULT_SHIFT_COLORS },
};

export function operationalShifts(profileShifts = []) {
  const ignored = new Set(["day staff", "administration", "admin"]);
  return (profileShifts || []).filter((shift) => !ignored.has(String(shift).toLowerCase()));
}

export function normalizeShiftRotation(input = {}, profileShifts = []) {
  const preset = ROTATION_PRESETS[input.preset] ? input.preset : "24/48-abc";
  const opsShifts = operationalShifts(profileShifts);
  const fallbackSequence = opsShifts.length >= 2
    ? opsShifts.slice(0, 3)
    : defaultShiftRotation.sequence;

  let sequence = Array.isArray(input.sequence) && input.sequence.length
    ? input.sequence.map(String)
    : (ROTATION_PRESETS[preset]?.sequence?.length ? ROTATION_PRESETS[preset].sequence : fallbackSequence);

  if (preset !== "custom" && ROTATION_PRESETS[preset]?.sequence?.length) {
    sequence = [...ROTATION_PRESETS[preset].sequence];
  }

  const shiftColors = { ...DEFAULT_SHIFT_COLORS, ...(input.shiftColors || {}) };
  sequence.forEach((label) => {
    if (!shiftColors[label]) {
      shiftColors[label] = "#64748b";
    }
  });

  const anchorShift = sequence.includes(input.anchorShift)
    ? input.anchorShift
    : sequence[0];

  return {
    preset,
    anchorDate: input.anchorDate || defaultShiftRotation.anchorDate,
    anchorShift,
    sequence,
    shiftColors,
  };
}

export function rotationSummary(rotation) {
  const preset = ROTATION_PRESETS[rotation.preset];
  if (rotation.preset === "custom") {
    return `Custom ${rotation.sequence.length}-day cycle`;
  }
  return preset?.label || "Shift rotation";
}

export function sequencePreview(rotation, count = 14) {
  const anchor = new Date(`${rotation.anchorDate}T12:00:00`);
  const anchorIndex = Math.max(rotation.sequence.indexOf(rotation.anchorShift), 0);
  const labels = [];

  for (let offset = 0; offset < count; offset += 1) {
    const index = ((anchorIndex + offset) % rotation.sequence.length + rotation.sequence.length) % rotation.sequence.length;
    const date = new Date(anchor);
    date.setDate(anchor.getDate() + offset);
    labels.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      shift: rotation.sequence[index],
    });
  }

  return labels;
}
