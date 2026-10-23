import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, Clock3, Gauge, Truck, Wrench, X, CirclePlus } from "lucide-react";
import FleetRecordEditModal, { APPARATUS_EDIT_FIELDS } from "../components/FleetRecordEditModal.jsx";
import { useDropdowns } from "../context/DropdownContext.jsx";
import { groupApparatusByStation, APPARATUS_UNASSIGNED_STATION } from "../lib/apparatusGrouping.js";

import { Badge, FleetSummary, Panel } from "../components/shell/ui.jsx";
import WorkOrderModal from "../components/fleet/WorkOrderModal.jsx";

export default function ApparatusPage({
  units = [],
  setUnits,
  workOrders = [],
  setWorkOrders,
  canEdit = false,
  legacyWritesLocked = false,
  onOpenFleetAssets,
}) {
  const { getOptions } = useDropdowns();
  const [selectedId, setSelectedId] = useState(units[0]?.id || "");
  const [showWorkOrder, setShowWorkOrder] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [message, setMessage] = useState("");

  const stationGroups = useMemo(
    () => groupApparatusByStation(units, getOptions("stations")),
    [units, getOptions],
  );

  useEffect(() => {
    if (!units.length) {
      setSelectedId("");
      return;
    }
    if (!units.some((unit) => unit.id === selectedId)) {
      setSelectedId(units[0].id);
    }
  }, [units, selectedId]);

  const selected = units.find((unit) => unit.id === selectedId) || units[0];
  if (!selected) {
    return <div className="module-page apparatus-page"><section className="placeholder-page"><h1>Apparatus</h1><p>No apparatus records found.</p></section></div>;
  }
  const unitOrders = workOrders.filter((order) => order.unit === selected.unit);
  function updateStatus(status) {
    if (!canEdit) return;
    setUnits((current) => current.map((unit) => unit.id === selected.id ? { ...unit, status } : unit));
    setMessage(`${selected.unit} status updated to ${status}`);
  }
  function completeCheck(checkName) {
    if (!canEdit) return;
    setUnits((current) => current.map((unit) => unit.id === selected.id ? { ...unit, checks: unit.checks.map(([name, status]) => name === checkName ? [name, "Complete"] : [name, status]) } : unit));
    setMessage(`${checkName} marked complete`);
  }
  const serviceHistory = unitOrders.filter((order) => order.status === "Complete").slice(0, 5);
  function createWorkOrder(order) {
    if (!canEdit) return;
    setWorkOrders((current) => [order, ...current]);
    setShowWorkOrder(false);
    setMessage(`Work order created for ${selected.unit}`);
  }
  function saveUnit(nextUnit) {
    setUnits((current) => current.map((unit) => unit.id === selected.id ? { ...unit, ...nextUnit, id: unit.id } : unit));
    setMessage(`${nextUnit.unit || selected.unit} updated`);
  }
  function addUnit() {
    const nextId = `APP-${String(units.length + 1).padStart(2, "0")}`;
    const nextUnit = {
      id: nextId,
      unit: "New Apparatus",
      type: "Apparatus",
      station: "Station 1",
      year: "",
      mileage: "",
      engineHours: "",
      pumpHours: "",
      fuel: "",
      pmDue: "",
      status: "In Service",
      operator: "Unassigned",
      checks: [],
    };
    setUnits((current) => [...current, nextUnit]);
    setSelectedId(nextId);
    setShowEdit(true);
    setMessage("New apparatus created — update details and save");
  }
  return <div className="module-page apparatus-page">
    <section className="module-heading"><div><span className="module-icon"><Truck size={22} /></span><div><h1>Apparatus</h1><p>Unit readiness, daily checks, operating metrics, service history, and repair requests.</p></div></div><div className="heading-actions">{canEdit && <button type="button" className="secondary-button" onClick={addUnit}><CirclePlus size={14} /> Add Unit</button>}<button className="secondary-button">Fleet Report</button><button className="primary-button" onClick={() => setShowWorkOrder(true)}><CirclePlus size={14} /> New Work Order</button></div></section>
    {legacyWritesLocked ? (
      <div className="warning-banner" role="status">
        Classic Apparatus list edits are locked after Fleet migration cutover.
        {" "}
        {typeof onOpenFleetAssets === "function" ? (
          <button type="button" className="text-button" onClick={onOpenFleetAssets}>Open All Fleet Assets</button>
        ) : null}
      </div>
    ) : null}
    <FleetSummary items={[["Total Units", units.length, "info"], ["In Service", units.filter((unit) => unit.status === "In Service").length, "success"], ["Out of Service", units.filter((unit) => unit.status === "Out of Service").length, "critical"], ["PM / Inspection Due", units.filter((unit) => /Due/.test(unit.status)).length, "warning"], ["Reserve", units.filter((unit) => unit.status === "Reserve").length, "neutral"]]} />
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="fleet-workspace">
      <Panel title="Fleet Units" icon={Truck} action={<span className="panel-count">{units.length} units</span>}>
        <div className="unit-list">
          {stationGroups.map(({ station, units: groupUnits }) => (
            <section key={station} className="unit-station-group">
              <h3 className={`unit-station-heading${station === APPARATUS_UNASSIGNED_STATION ? " is-unassigned" : ""}`}>
                {station}
                <span>{groupUnits.length}</span>
              </h3>
              {groupUnits.length ? groupUnits.map((unit, index) => (
                <button
                  key={unit.id || `${unit.unit}-${index}`}
                  className={unit.id === selected.id ? "unit-row selected" : "unit-row"}
                  onClick={() => setSelectedId(unit.id)}
                >
                  <span className="unit-icon"><Truck size={17} /></span>
                  <span><strong>{unit.unit || unit.id}</strong><small>{unit.type}</small></span>
                  <Badge>{unit.status}</Badge>
                </button>
              )) : (
                <p className="unit-station-empty">No apparatus assigned</p>
              )}
            </section>
          ))}
        </div>
      </Panel>
      <section className="fleet-detail">
        <header className="profile-header"><div className="profile-identity"><span className="unit-icon large"><Truck size={24} /></span><div><h2>{selected.unit}</h2><p>{selected.year} {selected.type} - {selected.station}</p><div><Badge>{selected.status}</Badge></div></div></div><div className="heading-actions">{canEdit && <button type="button" className="secondary-button" onClick={() => setShowEdit(true)}>Edit Unit</button>}<select className="status-select" value={selected.status} disabled={!canEdit} onChange={(event) => updateStatus(event.target.value)}>{["In Service", "Out of Service", "PM Due", "Reserve"].map((status) => <option key={status}>{status}</option>)}</select></div></header>
        <section className="metric-strip">{[["Mileage", selected.mileage], ["Engine Hours", selected.engineHours], ["Pump Hours", selected.pumpHours], ["PM Due", selected.pmDue]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
        <div className="fleet-detail-grid">
          <Panel title="Readiness Checks" icon={ClipboardCheck}><div className="check-list">{selected.checks.map(([name, status]) => <div key={name}><span>{name}</span><Badge>{status}</Badge>{status !== "Complete" && <button className="row-action" onClick={() => completeCheck(name)}>Complete</button>}</div>)}</div></Panel>
          <Panel title="Open & Recent Work Orders" icon={Wrench} action={canEdit ? <button className="text-button" onClick={() => setShowWorkOrder(true)}>Add</button> : null}><div className="compact-orders">{unitOrders.length ? unitOrders.map((order) => <div key={order.id}><div><strong>{order.id} - {order.issue}</strong><span>{order.vendor} - {order.cost}</span></div><Badge>{order.status}</Badge></div>) : <p>No work orders for this unit.</p>}</div></Panel>
          <Panel title="Operational Details" icon={Gauge}><div className="detail-pairs"><span>Assigned station</span><strong>{selected.station}</strong><span>Apparatus type</span><strong>{selected.type}</strong><span>Model year</span><strong>{selected.year}</strong></div></Panel>
          <Panel title="Service Timeline" icon={Clock3}>{serviceHistory.length ? <div className="service-timeline">{serviceHistory.map((order) => <div key={order.id}><i /><span><strong>{order.opened}</strong> {order.issue} ({order.id})</span></div>)}</div> : <p>No completed work orders for this unit yet.</p>}</Panel>
        </div>
      </section>
    </section>
    {showWorkOrder && canEdit && <WorkOrderModal fixedUnit={selected.unit} vendors={workOrders.map((order) => order.vendor)} onCreate={createWorkOrder} onClose={() => setShowWorkOrder(false)} />}
    {showEdit && canEdit && (
      <FleetRecordEditModal
        title={`Edit ${selected.unit}`}
        fields={APPARATUS_EDIT_FIELDS}
        record={selected}
        onSave={saveUnit}
        onClose={() => setShowEdit(false)}
      />
    )}
  </div>;
}
