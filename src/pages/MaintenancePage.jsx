import { useState } from "react";
import { BarChart3, CalendarDays, Check, Truck, Wrench, X, CirclePlus } from "lucide-react";

import { Badge, FleetSummary, Panel, MiniTable } from "../components/shell/ui.jsx";
import WorkOrderModal, { parseCost } from "../components/fleet/WorkOrderModal.jsx";

const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

export default function MaintenancePage({ orders = [], setOrders, units = [], canEdit = false }) {
  const [filter, setFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [message, setMessage] = useState("");
  const visibleOrders = orders.filter((order) => filter === "All" || order.status === filter);
  function updateOrder(id, status) {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    setMessage(`Work order ${id} updated to ${status}`);
  }
  function addOrder(order) {
    if (!canEdit) return;
    setOrders((current) => [order, ...current]);
    setShowNew(false);
    setMessage(`Work order ${order.id} created for ${order.unit}`);
  }
  // Spend by category, from the costs entered on work orders.
  const spendByCategory = Object.entries(orders.reduce((totals, order) => {
    const cost = parseCost(order.cost);
    if (cost > 0) totals[order.category || "General"] = (totals[order.category || "General"] || 0) + cost;
    return totals;
  }, {})).sort((x, y) => y[1] - x[1]);
  const topSpend = spendByCategory[0]?.[1] || 0;
  const upcomingPm = orders.filter((order) => order.category === "PM" && order.status !== "Complete");
  const unitNames = units.map((unit) => unit.unit).filter(Boolean);
  const vendors = orders.map((order) => order.vendor);
  return <div className="module-page maintenance-page">
    <section className="module-heading"><div><span className="module-icon"><Wrench size={22} /></span><div><h1>Maintenance</h1><p>Work-order queue, vendor coordination, repair costs, preventive maintenance, and completion tracking.</p></div></div><div className="heading-actions">{canEdit && <button className="primary-button" onClick={() => setShowNew(true)}><CirclePlus size={14} /> New Work Order</button>}</div></section>
    <FleetSummary items={[["Open Orders", orders.filter((order) => !/Complete/.test(order.status)).length, "info"], ["High Priority", orders.filter((order) => order.priority === "High").length, "critical"], ["Awaiting Parts", orders.filter((order) => order.status === "Awaiting Parts").length, "warning"], ["Scheduled", orders.filter((order) => order.status === "Scheduled").length, "info"], ["Completed", orders.filter((order) => order.status === "Complete").length, "success"]]} />
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="cert-toolbar"><div className="segmented-control">{["All", "Open", "In Progress", "Awaiting Parts", "Scheduled", "Complete"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><span>{visibleOrders.length} work orders shown</span></section>
    <Panel title="Maintenance Work Orders" icon={Wrench} action={<button className="text-button">Configure columns</button>}><div className="work-order-table"><div className="work-order-row work-order-head"><span>Work Order</span><span>Unit</span><span>Issue</span><span>Category</span><span>Priority</span><span>Vendor</span><span>Cost</span><span>Status</span></div>{visibleOrders.map((order) => <div className="work-order-row" key={order.id}><strong>{order.id}</strong><strong>{order.unit}</strong><span>{order.issue}</span><span>{order.category}</span><Badge>{order.priority}</Badge><span>{order.vendor}</span><span>{order.cost}</span><select value={order.status} disabled={!canEdit} onChange={(event) => updateOrder(order.id, event.target.value)}>{["Open", "In Progress", "Awaiting Parts", "Scheduled", "Complete"].map((status) => <option key={status}>{status}</option>)}</select></div>)}</div></Panel>
    <section className="maintenance-bottom"><Panel title="Upcoming Preventive Maintenance" icon={CalendarDays}>{upcomingPm.length ? <MiniTable columns={["Unit", "Service", "Opened", "Status"]} rows={upcomingPm.map((order) => [order.unit, order.issue, order.opened, order.status])} /> : <p className="empty-table">No open preventive maintenance work orders.</p>}</Panel><Panel title="Maintenance Spend" icon={BarChart3}>{spendByCategory.length ? <div className="spend-bars">{spendByCategory.map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(value)}</strong><i><b style={{ width: `${Math.max(4, Math.round((value / topSpend) * 100))}%` }} /></i></div>)}</div> : <p className="empty-table">No costs entered on work orders yet.</p>}</Panel></section>
    {showNew && canEdit && <WorkOrderModal unitNames={unitNames} vendors={vendors} onCreate={addOrder} onClose={() => setShowNew(false)} />}
  </div>;
}
