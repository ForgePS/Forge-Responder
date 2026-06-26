import { useMemo } from "react";
import { CirclePlus, RotateCcw, Trash2, Users } from "lucide-react";
import AdminTextInput from "./AdminTextInput.jsx";
import {
  CREW_SLOT_ROLE_SUGGESTIONS,
  findApparatusRecord,
  getDefaultApparatusCrewSlotRoles,
  hasCustomCrewSlotConfig,
  resolveApparatusCrewSlotRoles,
} from "../lib/apparatusCrewSlots.js";
import {
  DEFAULT_ROSTER_COMMAND_UNIT,
  normalizeSchedulingSettings,
  updateSchedulingCrewSlots,
} from "../lib/schedulingSettings.js";

function resolveUnitSlots(unit, schedulingSettings, apparatus) {
  const apparatusRecord = findApparatusRecord(apparatus, unit);
  return resolveApparatusCrewSlotRoles(unit, { apparatusRecord, schedulingSettings });
}

function ApparatusCrewSlotEditor({
  unit,
  slots = [],
  apparatusRecord = null,
  readOnly = false,
  onChange,
}) {
  const defaultSlots = getDefaultApparatusCrewSlotRoles(unit, apparatusRecord);
  const isCustom = slots.length > 0;

  function updateSlot(index, value) {
    const next = [...(slots.length ? slots : defaultSlots)];
    next[index] = value;
    onChange?.(next);
  }

  function addSlot() {
    const base = slots.length ? [...slots] : [...defaultSlots];
    base.push("Firefighter");
    onChange?.(base);
  }

  function removeSlot(index) {
    const base = slots.length ? [...slots] : [...defaultSlots];
    base.splice(index, 1);
    onChange?.(base);
  }

  function resetToDefault() {
    onChange?.([]);
  }

  const visibleSlots = slots.length ? slots : defaultSlots;

  return (
    <div className="apparatus-crew-slot-editor">
      <div className="apparatus-crew-slot-editor-head">
        <span>{visibleSlots.length} spot{visibleSlots.length === 1 ? "" : "s"}</span>
        {!readOnly ? (
          <div className="inline-actions">
            {isCustom ? (
              <button type="button" className="text-button" onClick={resetToDefault}>
                <RotateCcw size={13} /> Use default
              </button>
            ) : null}
            <button type="button" className="text-button" onClick={addSlot}>
              <CirclePlus size={13} /> Add spot
            </button>
          </div>
        ) : null}
      </div>

      <div className="apparatus-crew-slot-list">
        {visibleSlots.map((slotRole, index) => (
          <div className="apparatus-crew-slot-row" key={`${unit}-slot-${index}`}>
            <span className="apparatus-crew-slot-index">{index + 1}</span>
            {readOnly ? (
              <strong>{slotRole}</strong>
            ) : (
              <>
                <AdminTextInput
                  value={slotRole}
                  list={`crew-slot-suggestions-${unit.replace(/\s+/g, "-")}`}
                  onChange={(value) => updateSlot(index, value)}
                />
                <datalist id={`crew-slot-suggestions-${unit.replace(/\s+/g, "-")}`}>
                  {CREW_SLOT_ROLE_SUGGESTIONS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <button
                  type="button"
                  className="row-action danger"
                  onClick={() => removeSlot(index)}
                  aria-label={`Remove spot ${index + 1}`}
                  disabled={visibleSlots.length <= 1}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {!isCustom ? (
        <p className="auth-help apparatus-crew-slot-default-note">Using department default positions for this apparatus type.</p>
      ) : null}
    </div>
  );
}

export default function ApparatusCrewSlotsPanel({
  value,
  onChange,
  availableUnits = [],
  apparatus = [],
  readOnly = false,
}) {
  const normalized = useMemo(
    () => normalizeSchedulingSettings(value, availableUnits),
    [value, availableUnits]
  );

  const unitRows = useMemo(() => {
    const fleet = (Array.isArray(availableUnits) ? availableUnits : [])
      .map(String)
      .map((unit) => unit.trim())
      .filter(Boolean);
    const units = [...new Set([DEFAULT_ROSTER_COMMAND_UNIT, ...fleet])];

    return units.map((unit) => {
      const apparatusRecord = findApparatusRecord(apparatus, unit);
      const configured = normalized.crewSlotsByUnit?.[unit] || [];
      return {
        unit,
        apparatusRecord,
        typeLabel: apparatusRecord?.type || "Apparatus",
        stationLabel: apparatusRecord?.station || "—",
        slots: configured,
        isCustom: hasCustomCrewSlotConfig(unit, normalized),
        effectiveSlots: resolveUnitSlots(unit, normalized, apparatus),
      };
    });
  }, [availableUnits, apparatus, normalized]);

  function updateUnitSlots(unit, slots) {
    if (readOnly) return;
    onChange?.(updateSchedulingCrewSlots(normalized, unit, slots, availableUnits));
  }

  return (
    <section className="apparatus-crew-slots-panel panel">
      <header>
        <div>
          <Users size={15} />
          <strong>Scheduling — Apparatus Crew Positions</strong>
        </div>
      </header>
      <div className="panel-body">
        <p className="auth-help">
          {readOnly
            ? "Crew positions define how many spots each apparatus has and what rank/role label appears on the daily roster, roster detail, and 7-day schedule."
            : "Set how many crew spots each apparatus requires and the position label for each spot. Leave a unit on the default template or customize positions per apparatus."}
        </p>

        {!unitRows.length ? (
          <p className="auth-help">Add apparatus in the Apparatus module to configure crew positions.</p>
        ) : (
          <div className="apparatus-crew-slots-grid">
            {unitRows.map((row) => (
              <article
                key={row.unit}
                className={`apparatus-crew-slots-card${row.isCustom ? " is-custom" : ""}`}
              >
                <header className="apparatus-crew-slots-card-head">
                  <div>
                    <strong>{row.unit}</strong>
                    <span>{row.typeLabel}{row.stationLabel !== "—" ? ` · ${row.stationLabel}` : ""}</span>
                  </div>
                  <span className="badge badge-neutral">
                    {row.effectiveSlots.length} spot{row.effectiveSlots.length === 1 ? "" : "s"}
                  </span>
                </header>
                <ApparatusCrewSlotEditor
                  unit={row.unit}
                  slots={row.slots}
                  apparatusRecord={row.apparatusRecord}
                  readOnly={readOnly}
                  onChange={(slots) => updateUnitSlots(row.unit, slots)}
                />
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
