import { useState } from "react";
import { BarChart3, CalendarDays, Check, Truck, Wrench, X, CirclePlus } from "lucide-react";

import { Badge, FleetSummary, Panel, MiniTable, Modal } from "../components/shell/ui.jsx";

export default function MaintenancePage({ orders = [], setOrders }) {
  const [filter, setFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [message, setMessage] = useState("");
  const visibleOrders = orders.filter((order) => filter === "All" || order.status === filter);
  function updateOrder(id, status) {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    setMessage(`Work order ${id} updated to ${status}`);
  }
  function addOrder() {
    setOrders((current) => [{ id: `WO-${26050 + current.length}`, unit: "FD-2", issue: "Scheduled preventive maintenance", category: "PM", priority: "Medium", opened: "Jun 7", vendor: "Internal Fleet", cost: "Pending", status: "Open" }, ...current]);
    setShowNew(false);
    setMessage("New maintenance work order created");
  }
  return <div className="module-page maintenance-page">
    <section className="module-heading"><div><span className="module-icon"><Wrench size={22} /></span><div><h1>Maintenance</h1><p>Work-order queue, vendor coordination, repair costs, preventive maintenance, and completion tracking.</p></div></div><div className="heading-actions"><button className="secondary-button">Cost Report</button><button className="primary-button" onClick={() => setShowNew(true)}><CirclePlus size={14} /> New Work Order</button></div></section>
    <FleetSummary items={[["Open Orders", orders.filter((order) => !/Complete/.test(order.status)).length, "info"], ["High Priority", orders.filter((order) => order.priority === "High").length, "critical"], ["Awaiting Parts", orders.filter((order) => order.status === "Awaiting Parts").length, "warning"], ["Scheduled", orders.filter((order) => order.status === "Scheduled").length, "info"], ["Completed", orders.filter((order) => order.status === "Complete").length, "success"]]} />
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}
    <section className="cert-toolbar"><div className="segmented-control">{["All", "Open", "In Progress", "Awaiting Parts", "Scheduled", "Complete"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div><span>{visibleOrders.length} work orders shown</span></section>
    <Panel title="Maintenance Work Orders" icon={Wrench} action={<button className="text-button">Configure columns</button>}><div className="work-order-table"><div className="work-order-row work-order-head"><span>Work Order</span><span>Unit</span><span>Issue</span><span>Category</span><span>Priority</span><span>Vendor</span><span>Cost</span><span>Status</span></div>{visibleOrders.map((order) => <div className="work-order-row" key={order.id}><strong>{order.id}</strong><strong>{order.unit}</strong><span>{order.issue}</span><span>{order.category}</span><Badge>{order.priority}</Badge><span>{order.vendor}</span><span>{order.cost}</span><select value={order.status} onChange={(event) => updateOrder(order.id, event.target.value)}>{["Open", "In Progress", "Awaiting Parts", "Scheduled", "Complete"].map((status) => <option key={status}>{status}</option>)}</select></div>)}</div></Panel>
    <section className="maintenance-bottom"><Panel title="Upcoming Preventive Maintenance" icon={CalendarDays}><MiniTable columns={["Unit", "Service", "Due", "Status"]} rows={[["Truck 3", "Aerial inspection", "Jun 18", "Due Soon"], ["FD-2", "Annual service", "Jun 21", "Upcoming"], ["Engine 1", "Oil and filters", "Aug 14", "Upcoming"]]} /></Panel><Panel title="Maintenance Spend" icon={BarChart3}><div className="spend-bars">{[["Repairs", "$12,840", "72%"], ["Preventive", "$6,420", "48%"], ["Tires", "$3,180", "31%"]].map(([label, value, width]) => <div key={label}><span>{label}</span><strong>{value}</strong><i><b style={{ width }} /></i></div>)}</div></Panel></section>
    {showNew && <Modal title="New Maintenance Work Order" onClose={() => setShowNew(false)}><div className="workflow-form"><label><span>Unit</span><select><option>FD-2</option><option>Engine 1</option><option>Truck 3</option></select></label><label><span>Priority</span><select><option>Medium</option><option>High</option><option>Low</option></select></label><label className="wide-field"><span>Issue Description</span><input defaultValue="Scheduled preventive maintenance" /></label><label><span>Category</span><select><option>PM</option><option>General</option><option>Electrical</option></select></label><label><span>Vendor</span><select><option>Internal Fleet</option><option>Mid-South Apparatus</option></select></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setShowNew(false)}>Cancel</button><button className="primary-button" onClick={addOrder}><Check size={14} /> Create Work Order</button></div></Modal>}
  </div>;
}
