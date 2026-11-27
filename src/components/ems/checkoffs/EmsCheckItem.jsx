import { useEffect, useMemo, useState } from "react";
import { CheckCheck } from "lucide-react";
import { loadUnitEmsRecords } from "../../../lib/ems/emsCheckoffService.js";
import { EQUIPMENT_STATES, EQUIPMENT_STATE_LABELS, localDate } from "../../../lib/ems/checkoffLogic.js";
import "../../../styles/ems-checkoffs.css";

function sameExpected(a = [], b = []) {
  return a.length === b.length && a.every((row, i) => row.id === b[i].id && row.parMin === b[i].parMin);
}

/**
 * One EMS checklist item: every piece of equipment on the unit (Present /
 * Damaged / Missing), or every supply with a par level at the unit's EMS
 * locations (count it, flag expired stock). The answer keeps the list the unit
 * had, so the result is judged against what the crew saw.
 */
export default function EmsCheckItem({ field, value, onChange, locked, departmentId, fleetAssetId, preview = false }) {
  const isEquipment = field.type === "ems_equipment";
  const [loaded, setLoaded] = useState(null);
  const answer = value && typeof value === "object" ? value : { expected: null, rows: {} };
  const rowsById = answer.rows || {};

  useEffect(() => {
    if (preview) {
      setLoaded({ list: [], error: "" });
      return undefined;
    }
    let cancelled = false;
    loadUnitEmsRecords(departmentId, fleetAssetId, { equipment: isEquipment, supplies: !isEquipment }).then((records) => {
      if (cancelled) return;
      setLoaded({
        list: isEquipment ? records.equipment : records.supplies,
        error: isEquipment ? records.equipmentError : records.suppliesError,
      });
    });
    return () => { cancelled = true; };
  }, [departmentId, fleetAssetId, isEquipment, preview]);

  const list = useMemo(() => loaded?.list || [], [loaded]);
  const expected = useMemo(() => list.map((row) => (isEquipment
    ? { id: row.id, name: row.name }
    : { id: row.id, name: row.name, parMin: row.parMin })), [list, isEquipment]);

  // Keep the list the crew sees in the answer (done checks keep the one they saw).
  useEffect(() => {
    if (!loaded || loaded.error || locked) return;
    if (!Array.isArray(answer.expected) || !sameExpected(answer.expected, expected)) {
      onChange({ expected, rows: Object.fromEntries(Object.entries(rowsById).filter(([id]) => expected.some((row) => row.id === id))) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, expected, locked]);

  function setRow(id, patch) {
    onChange({ expected, rows: { ...rowsById, [id]: { ...(rowsById[id] || {}), ...patch } } });
  }

  function markAllPresent() {
    const next = { ...rowsById };
    for (const row of list) if (!next[row.id]?.state) next[row.id] = { state: "present" };
    onChange({ expected, rows: next });
  }

  if (preview) {
    return (
      <p className="occupancy-muted">
        {isEquipment
          ? "Members see every piece of EMS equipment on the unit here and mark each Present, Damaged or Missing."
          : "Members see every supply with a par level on the unit here and count each one."}
      </p>
    );
  }
  if (!loaded) return <p className="occupancy-muted">Loading the unit's {isEquipment ? "equipment" : "supplies"}…</p>;
  if (loaded.error) return <p className="form-error">{loaded.error}</p>;
  if (!list.length) {
    return (
      <p className="occupancy-muted">
        {isEquipment
          ? "No EMS equipment is placed on this unit. Nothing to check."
          : "No supplies have a par level at this unit's EMS locations. Nothing to count."}
      </p>
    );
  }

  const today = localDate();
  if (isEquipment) {
    const unanswered = list.filter((row) => !rowsById[row.id]?.state).length;
    return (
      <div className="ems-check-rows">
        {!locked && unanswered ? (
          <button type="button" className="text-button" onClick={markAllPresent}>
            <CheckCheck size={14} aria-hidden="true" /> Mark the other {unanswered} present
          </button>
        ) : null}
        {list.map((item) => {
          const row = rowsById[item.id] || {};
          return (
            <div key={item.id} className={`ems-check-row${row.state && row.state !== "present" ? " is-problem" : ""}`}>
              <div className="ems-check-row-name">
                <strong>{item.name}</strong>
                <small>{[item.assetNumber, item.category, item.assignment?.locationName].filter(Boolean).join(" · ")}</small>
              </div>
              <div className="check-choice" role="radiogroup" aria-label={item.name}>
                {EQUIPMENT_STATES.map((state) => (
                  <button
                    key={state}
                    type="button"
                    role="radio"
                    aria-checked={row.state === state}
                    className={`check-choice-button is-${state === "present" ? "pass" : "fail"}${row.state === state ? " is-selected" : ""}`}
                    disabled={locked}
                    onClick={() => setRow(item.id, { state: row.state === state ? "" : state })}
                  >
                    {EQUIPMENT_STATE_LABELS[state]}
                  </button>
                ))}
              </div>
              {row.state === "damaged" ? (
                <label className="inline-check">
                  <input type="checkbox" checked={Boolean(row.outOfUse)} disabled={locked} onChange={(e) => setRow(item.id, { outOfUse: e.target.checked })} />
                  Take it out of use until it's repaired
                </label>
              ) : null}
              {row.state && row.state !== "present" ? (
                <textarea
                  className="check-fail-note"
                  rows={2}
                  placeholder={row.state === "missing" ? "Where was it last seen? (optional)" : "What's wrong? (optional)"}
                  value={row.note || ""}
                  disabled={locked}
                  onChange={(e) => setRow(item.id, { note: e.target.value })}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="ems-check-rows">
      {list.map((supply) => {
        const row = rowsById[supply.id] || {};
        const count = row.count ?? "";
        const short = count !== "" && supply.parMin !== null && Number(count) < supply.parMin;
        const expiredOnRecord = supply.earliestExpiration && supply.earliestExpiration < today;
        return (
          <div key={supply.id} className={`ems-check-row${short || row.expiredFound ? " is-problem" : ""}`}>
            <div className="ems-check-row-name">
              <strong>{supply.name}</strong>
              <small>
                {[supply.locationName, supply.parMin !== null ? `minimum ${supply.parMin}` : "", `${supply.onHand} on record`,
                  supply.earliestExpiration ? `earliest expiration ${supply.earliestExpiration}` : ""].filter(Boolean).join(" · ")}
              </small>
              {expiredOnRecord ? <small className="check-reading-warning">Records show expired stock here. Check the dates.</small> : null}
            </div>
            <div className="check-number-field">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={count}
                disabled={locked}
                aria-label={`${supply.name} count`}
                placeholder="Count"
                onChange={(e) => setRow(supply.id, { count: e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))) })}
              />
              <span>{supply.unitOfMeasure}</span>
            </div>
            <label className="inline-check">
              <input type="checkbox" checked={Boolean(row.expiredFound)} disabled={locked} onChange={(e) => setRow(supply.id, { expiredFound: e.target.checked })} />
              Expired stock found
            </label>
            {short ? <small className="check-reading-warning">Below the minimum of {supply.parMin}. This will be reported for restocking.</small> : null}
          </div>
        );
      })}
    </div>
  );
}
