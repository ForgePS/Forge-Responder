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
    label: "Custom cycle",
    description: "Set how many days the pattern repeats, then assign each day.",
    sequence: [],
  },
};

export const defaultShiftRotation = {
  preset: "24/48-abc",
  anchorDate: "2026-06-07",
  anchorShift: "A Shift",
  cycleDays: 3,
  sequence: ["A Shift", "B Shift", "C Shift"],
  shiftColors: { ...DEFAULT_SHIFT_COLORS },
};

export const MAX_CYCLE_DAYS = 31;

export function operationalShifts(profileShifts = []) {
  const ignored = new Set(["day staff", "administration", "admin"]);
  return (profileShifts || []).filter((shift) => !ignored.has(String(shift).toLowerCase()));
}

export function shiftOptions(profileShifts = [], rotation = {}) {
  return [...new Set([
    ...(Array.isArray(rotation.sequence) ? rotation.sequence : []),
    ...operationalShifts(profileShifts),
    ...defaultShiftRotation.sequence,
  ].filter(Boolean))];
}

export function clampCycleDays(value, fallback = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_CYCLE_DAYS, Math.round(parsed)));
}

export function resizeSequence(sequence = [], targetLength, shiftPool = defaultShiftRotation.sequence) {
  const pool = shiftPool.length ? shiftPool : defaultShiftRotation.sequence;
  const length = clampCycleDays(targetLength, pool.length || 3);
  const result = [];

  for (let index = 0; index < length; index += 1) {
    if (index < sequence.length && sequence[index]) {
      result.push(String(sequence[index]));
      continue;
    }

    if (result.length) {
      const previousIndex = pool.indexOf(result[result.length - 1]);
      const nextIndex = previousIndex >= 0
        ? (previousIndex + 1) % pool.length
        : index % pool.length;
      result.push(pool[nextIndex]);
      continue;
    }

    result.push(pool[index % pool.length]);
  }

  return result;
}

export function normalizeShiftRotation(input = {}, profileShifts = []) {
  const preset = ROTATION_PRESETS[input.preset] ? input.preset : "24/48-abc";
  const opsShifts = operationalShifts(profileShifts);
  const fallbackSequence = opsShifts.length >= 2
    ? opsShifts.slice(0, 3)
    : defaultShiftRotation.sequence;

  let sequence;
  let cycleDays;

  if (preset === "custom") {
    cycleDays = clampCycleDays(
      input.cycleDays || input.sequence?.length || fallbackSequence.length,
      fallbackSequence.length
    );
    const sourceSequence = Array.isArray(input.sequence) ? input.sequence.map(String) : [];
    sequence = resizeSequence(sourceSequence, cycleDays, opsShifts.length ? opsShifts : fallbackSequence);
  } else {
    sequence = [...(ROTATION_PRESETS[preset]?.sequence || fallbackSequence)];
    cycleDays = sequence.length;
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
    cycleDays,
    sequence,
    shiftColors,
  };
}

export function rotationSummary(rotation) {
  const preset = ROTATION_PRESETS[rotation.preset];
  if (rotation.preset === "custom") {
    const days = rotation.cycleDays || rotation.sequence?.length || 0;
    return `Custom ${days}-day repeating cycle`;
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
