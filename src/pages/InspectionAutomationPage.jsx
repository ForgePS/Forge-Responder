import { useEffect, useState } from "react";
import {
  Cable,
  CalendarDays,
  CirclePlus,
  GitBranch,
  Play,
  Zap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionStatusBadge from "../components/inspections/InspectionStatusBadge.jsx";
import InspectionsModuleLayout, {
  PREVENTION_TOOL_TABS,
} from "../components/inspections/InspectionsModuleLayout.jsx";
import {
  canManageInspectionAutomation,
  canViewInspectionAutomation,
  getAutomationActions,
  getAutomationStatuses,
  getAutomationTriggers,
  getCalendarEventTypes,
  getCalendarSyncModes,
  getInspectionIntegrationAdapterTypes,
  getNerisEntityTypes,
  getWebhookEventTypes,
  getWorkflowTemplates,
  labelForAutomationAction,
  labelForAutomationStatus,
  labelForAutomationTrigger,
  loadInspectionAutomationBoard,
  publishInspectionWorkflow,
  runInspectionAutomation,
  saveInspectionAutomation,
  saveInspectionCalendarEvent,
  saveInspectionIntegrationAdapter,
  saveInspectionNerisMapping,
  saveInspectionWebhook,
  saveInspectionWorkflow,
  testInspectionIntegrationAdapter,
  testInspectionWebhook,
} from "../lib/inspections/index.js";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

const TABS = [
  { id: "automations", label: "Automations" },
  { id: "workflows", label: "Workflows" },
  { id: "webhooks", label: "Webhooks" },
  { id: "calendar", label: "Calendar" },
  { id: "neris", label: "NERIS links" },
  { id: "adapters", label: "Adapters" },
];

export default function InspectionAutomationPage({ onNavigate, query = "" }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewInspectionAutomation(permissions, isCreator);
  const canManage = canManageInspectionAutomation(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("automations");
  const [board, setBoard] = useState(null);
  const [modal, setModal] = useState("");
  const [runPreview, setRunPreview] = useState(null);

  const [autoDraft, setAutoDraft] = useState({
    name: "",
    trigger: "inspection_overdue",
    action: "notify_supervisor",
    status: "draft",
    description: "",
  });
  const [workflowDraft, setWorkflowDraft] = useState({
    name: "",
    templateId: "standard_inspection",
    status: "draft",
  });
  const [webhookDraft, setWebhookDraft] = useState({
    name: "",
    url: "",
    status: "draft",
    events: ["inspection.completed"],
  });
  const [calendarDraft, setCalendarDraft] = useState({
    title: "",
    eventType: "inspection",
    syncMode: "local_only",
    startsAt: "",
    endsAt: "",
    location: "",
    assigneeName: "",
  });
  const [nerisDraft, setNerisDraft] = useState({
    entityType: "occupancy",
    forgeRecordId: "",
    forgeLabel: "",
    nerisEntityId: "",
    nerisResourceId: "",
    riskClass: "",
  });
  const [adapterDraft, setAdapterDraft] = useState({
    name: "",
    adapterType: "webhook",
    status: "draft",
    endpoint: "",
  });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const triggers = getAutomationTriggers();
  const actions = getAutomationActions();
  const statuses = getAutomationStatuses();
  const templates = getWorkflowTemplates();
  const webhookEvents = getWebhookEventTypes();
  const calendarTypes = getCalendarEventTypes();
  const syncModes = getCalendarSyncModes();
  const nerisTypes = getNerisEntityTypes();
  const adapterTypes = getInspectionIntegrationAdapterTypes();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setBoard(await loadInspectionAutomationBoard(departmentId));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load automation board.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const needle = String(query || "").trim().toLowerCase();
  function matchesQuery(row) {
    if (!needle) return true;
    return Object.values(row).join(" ").toLowerCase().includes(needle);
  }

  async function run(fn, success) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await fn();
      setMessage(typeof success === "function" ? success(result) : success);
      setModal("");
      await reload();
      return result;
    } catch (actionError) {
      setError(actionError?.message || "Action failed.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  return (
    <InspectionPermissionGate allowed={allowed} title="Automation & Integrations">
      <InspectionsModuleLayout
        title="Automation & Integrations"
        description="Automation rules, workflow templates, webhooks, calendar stubs, NERIS relationship mappings, and adapters."
        activeNavName="Automation & Integrations"
        onNavigate={onNavigate}
        tabs={PREVENTION_TOOL_TABS}
        actions={canManage ? (
          <div className="occupancy-detail-actions">
            <button className="primary-button" type="button" onClick={() => setModal("automation")}>
              <CirclePlus size={14} /> New automation
            </button>
            <button className="secondary-button" type="button" onClick={() => setModal("workflow")}>
              <GitBranch size={14} /> New workflow
            </button>
          </div>
        ) : null}
      >
        {error ? <p className="occupancy-error">{error}</p> : null}
        {message ? <p className="occupancy-message">{message}</p> : null}
        {loading ? <p className="occupancy-muted">Loading automations…</p> : null}

        {!loading ? (
          <div className="inspections-kpi-grid">
            {[
              ["Enabled automations", board?.metrics?.automationsEnabled || 0],
              ["Draft automations", board?.metrics?.automationsDraft || 0],
              ["Published workflows", board?.metrics?.workflowsPublished || 0],
              ["Active webhooks", board?.metrics?.webhooksActive || 0],
              ["Upcoming calendar", board?.metrics?.calendarUpcoming || 0],
              ["NERIS mappings", board?.metrics?.nerisMapped || 0],
            ].map(([label, value]) => (
              <div key={label} className="inspections-kpi-card">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Automation sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`inspections-subnav-item${tab === item.id ? " active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        ) : null}

        {modal === "automation" && canManage ? (
          <section className="panel">
            <header><div><Zap size={15} /><strong>New automation</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name" wide>
                <input value={autoDraft.name} onChange={(e) => setAutoDraft((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="Trigger">
                <select value={autoDraft.trigger} onChange={(e) => setAutoDraft((c) => ({ ...c, trigger: e.target.value }))}>
                  {triggers.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Action">
                <select value={autoDraft.action} onChange={(e) => setAutoDraft((c) => ({ ...c, action: e.target.value }))}>
                  {actions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={autoDraft.status} onChange={(e) => setAutoDraft((c) => ({ ...c, status: e.target.value }))}>
                  {statuses.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Description" wide>
                <textarea rows={2} value={autoDraft.description} onChange={(e) => setAutoDraft((c) => ({ ...c, description: e.target.value }))} />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !autoDraft.name}
                  onClick={() => run(() => saveInspectionAutomation(departmentId, autoDraft, actor), "Automation saved.")}
                >
                  Save
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "workflow" && canManage ? (
          <section className="panel">
            <header><div><GitBranch size={15} /><strong>New workflow</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name" wide>
                <input value={workflowDraft.name} onChange={(e) => setWorkflowDraft((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="Template" wide>
                <select value={workflowDraft.templateId} onChange={(e) => setWorkflowDraft((c) => ({ ...c, templateId: e.target.value }))}>
                  {templates.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !workflowDraft.name}
                  onClick={() => run(() => saveInspectionWorkflow(departmentId, workflowDraft, actor), "Workflow saved.")}
                >
                  Save
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "webhook" && canManage ? (
          <section className="panel">
            <header><div><Cable size={15} /><strong>New webhook</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name" wide>
                <input value={webhookDraft.name} onChange={(e) => setWebhookDraft((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="URL" wide>
                <input value={webhookDraft.url} onChange={(e) => setWebhookDraft((c) => ({ ...c, url: e.target.value }))} placeholder="https://…" />
              </Field>
              <Field label="Events" wide>
                <select
                  multiple
                  size={5}
                  value={webhookDraft.events}
                  onChange={(e) => setWebhookDraft((c) => ({
                    ...c,
                    events: Array.from(e.target.selectedOptions).map((opt) => opt.value),
                  }))}
                >
                  {webhookEvents.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !webhookDraft.name || !webhookDraft.url}
                  onClick={() => run(() => saveInspectionWebhook(departmentId, webhookDraft, actor), "Webhook saved.")}
                >
                  Save
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "calendar" && canManage ? (
          <section className="panel">
            <header><div><CalendarDays size={15} /><strong>New calendar event</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Title" wide>
                <input value={calendarDraft.title} onChange={(e) => setCalendarDraft((c) => ({ ...c, title: e.target.value }))} />
              </Field>
              <Field label="Type">
                <select value={calendarDraft.eventType} onChange={(e) => setCalendarDraft((c) => ({ ...c, eventType: e.target.value }))}>
                  {calendarTypes.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Sync mode">
                <select value={calendarDraft.syncMode} onChange={(e) => setCalendarDraft((c) => ({ ...c, syncMode: e.target.value }))}>
                  {syncModes.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Starts">
                <input type="datetime-local" value={calendarDraft.startsAt} onChange={(e) => setCalendarDraft((c) => ({ ...c, startsAt: e.target.value }))} />
              </Field>
              <Field label="Ends">
                <input type="datetime-local" value={calendarDraft.endsAt} onChange={(e) => setCalendarDraft((c) => ({ ...c, endsAt: e.target.value }))} />
              </Field>
              <Field label="Location" wide>
                <input value={calendarDraft.location} onChange={(e) => setCalendarDraft((c) => ({ ...c, location: e.target.value }))} />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !calendarDraft.title}
                  onClick={() => run(async () => {
                    const startsAt = calendarDraft.startsAt ? new Date(calendarDraft.startsAt).toISOString() : "";
                    const endsAt = calendarDraft.endsAt ? new Date(calendarDraft.endsAt).toISOString() : "";
                    return saveInspectionCalendarEvent(departmentId, { ...calendarDraft, startsAt, endsAt }, actor);
                  }, "Calendar event saved.")}
                >
                  Save
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "neris" && canManage ? (
          <section className="panel">
            <header><div><strong>NERIS relationship mapping</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Entity type">
                <select value={nerisDraft.entityType} onChange={(e) => setNerisDraft((c) => ({ ...c, entityType: e.target.value }))}>
                  {nerisTypes.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Forge record ID">
                <input value={nerisDraft.forgeRecordId} onChange={(e) => setNerisDraft((c) => ({ ...c, forgeRecordId: e.target.value }))} />
              </Field>
              <Field label="Forge label" wide>
                <input value={nerisDraft.forgeLabel} onChange={(e) => setNerisDraft((c) => ({ ...c, forgeLabel: e.target.value }))} />
              </Field>
              <Field label="NERIS entity ID">
                <input value={nerisDraft.nerisEntityId} onChange={(e) => setNerisDraft((c) => ({ ...c, nerisEntityId: e.target.value }))} />
              </Field>
              <Field label="NERIS resource ID">
                <input value={nerisDraft.nerisResourceId} onChange={(e) => setNerisDraft((c) => ({ ...c, nerisResourceId: e.target.value }))} />
              </Field>
              <Field label="Risk class">
                <input value={nerisDraft.riskClass} onChange={(e) => setNerisDraft((c) => ({ ...c, riskClass: e.target.value }))} />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !nerisDraft.forgeLabel}
                  onClick={() => run(() => saveInspectionNerisMapping(departmentId, nerisDraft, actor), "NERIS mapping saved.")}
                >
                  Save
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "adapter" && canManage ? (
          <section className="panel">
            <header><div><Cable size={15} /><strong>New integration adapter</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name" wide>
                <input value={adapterDraft.name} onChange={(e) => setAdapterDraft((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="Type">
                <select value={adapterDraft.adapterType} onChange={(e) => setAdapterDraft((c) => ({ ...c, adapterType: e.target.value }))}>
                  {adapterTypes.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Endpoint" wide>
                <input value={adapterDraft.endpoint} onChange={(e) => setAdapterDraft((c) => ({ ...c, endpoint: e.target.value }))} />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !adapterDraft.name}
                  onClick={() => run(() => saveInspectionIntegrationAdapter(departmentId, adapterDraft, actor), "Adapter saved.")}
                >
                  Save
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && tab === "automations" ? (
          <section className="panel">
            <header><div><Zap size={15} /><strong>Automations</strong></div></header>
            <div className="panel-body">
              {!(board?.automations || []).filter(matchesQuery).length ? (
                <InspectionEmptyState title="No automations" description="Create trigger → action rules for prevention workflows." />
              ) : (
                <div className="personnel-list">
                  {(board.automations || []).filter(matchesQuery).map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.name}</strong>
                        <small className="occupancy-muted">
                          {" "}{labelForAutomationTrigger(row.trigger)} → {labelForAutomationAction(row.action)}
                          {row.lastRunAt ? ` · last ${formatWhen(row.lastRunAt)}` : ""}
                        </small>
                      </span>
                      <div className="occupancy-detail-actions">
                        <InspectionStatusBadge status={labelForAutomationStatus(row.status)} />
                        {canManage ? (
                          <>
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={saving}
                              onClick={() => run(async () => {
                                const result = await runInspectionAutomation(departmentId, row.id, { dryRun: true }, actor);
                                setRunPreview(result);
                                return result;
                              }, (result) => result?.run?.message || "Dry run complete.")}
                            >
                              <Play size={14} /> Dry run
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={saving}
                              onClick={() => run(async () => {
                                const result = await runInspectionAutomation(departmentId, row.id, { dryRun: false }, actor);
                                setRunPreview(result);
                                return result;
                              }, (result) => result?.run?.message || "Run complete.")}
                            >
                              <Play size={14} /> Run
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "workflows" ? (
          <section className="panel">
            <header><div><GitBranch size={15} /><strong>Workflows</strong></div></header>
            <div className="panel-body">
              {!(board?.workflows || []).length ? (
                <InspectionEmptyState title="No workflows" description="Start from a template, then publish a version." />
              ) : (
                <div className="personnel-list">
                  {(board.workflows || []).map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.name}</strong>
                        <small className="occupancy-muted">
                          {" "}v{row.version} · {(row.nodes || []).join(" → ")}
                        </small>
                      </span>
                      <div className="occupancy-detail-actions">
                        <InspectionStatusBadge status={row.status} />
                        {canManage && row.status !== "published" ? (
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={saving}
                            onClick={() => run(
                              () => publishInspectionWorkflow(departmentId, row.id, actor),
                              "Workflow published."
                            )}
                          >
                            Publish
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "webhooks" ? (
          <section className="panel">
            <header>
              <div><Cable size={15} /><strong>Webhooks</strong></div>
              {canManage ? (
                <button className="secondary-button" type="button" onClick={() => setModal("webhook")}>
                  <CirclePlus size={14} /> Add webhook
                </button>
              ) : null}
            </header>
            <div className="panel-body">
              <p className="occupancy-muted">Outbound webhook delivery is stubbed — Test records a signed-post simulation.</p>
              {!(board?.webhooks || []).length ? (
                <InspectionEmptyState title="No webhooks" description="Register endpoints for inspection lifecycle events." />
              ) : (
                <div className="personnel-list">
                  {(board.webhooks || []).map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.name}</strong>
                        <small className="occupancy-muted"> {row.url} · {(row.events || []).join(", ")}</small>
                      </span>
                      <div className="occupancy-detail-actions">
                        <InspectionStatusBadge status={row.status} />
                        {canManage ? (
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={saving}
                            onClick={() => run(
                              () => testInspectionWebhook(departmentId, row.id, actor),
                              (result) => result?.lastTestResult || "Webhook tested."
                            )}
                          >
                            Test
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "calendar" ? (
          <section className="panel">
            <header>
              <div><CalendarDays size={15} /><strong>Calendar</strong></div>
              {canManage ? (
                <button className="secondary-button" type="button" onClick={() => setModal("calendar")}>
                  <CirclePlus size={14} /> Add event
                </button>
              ) : null}
            </header>
            <div className="panel-body">
              <p className="occupancy-muted">Google / Microsoft sync modes store external IDs only — live calendar APIs are deferred.</p>
              {!(board?.calendarEvents || []).length ? (
                <InspectionEmptyState title="No calendar events" description="Schedule inspections, reinspections, and hearings." />
              ) : (
                <div className="personnel-list">
                  {(board.calendarEvents || []).map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.title}</strong>
                        <small className="occupancy-muted">
                          {" "}{row.eventType} · {formatWhen(row.startsAt)} · {row.syncMode}
                          {row.externalId ? ` · ${row.externalId}` : ""}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "neris" ? (
          <section className="panel">
            <header>
              <div><strong>NERIS relationship layer</strong></div>
              {canManage ? (
                <button className="secondary-button" type="button" onClick={() => setModal("neris")}>
                  <CirclePlus size={14} /> Add mapping
                </button>
              ) : null}
            </header>
            <div className="panel-body">
              <p className="occupancy-muted">
                Maps Forge occupancy / inspection / preplan / FPS records to NERIS entity IDs without forcing inspections into an incident schema.
              </p>
              {!(board?.nerisMappings || []).length ? (
                <InspectionEmptyState title="No NERIS mappings" description="Link prevention records to NERIS entity identifiers." />
              ) : (
                <div className="personnel-list">
                  {(board.nerisMappings || []).map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.forgeLabel || row.forgeRecordId}</strong>
                        <small className="occupancy-muted">
                          {" "}{row.entityType} · NERIS {row.nerisEntityId || "—"} / {row.nerisResourceId || "—"}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "adapters" ? (
          <section className="panel">
            <header>
              <div><Cable size={15} /><strong>Integration adapters</strong></div>
              {canManage ? (
                <button className="secondary-button" type="button" onClick={() => setModal("adapter")}>
                  <CirclePlus size={14} /> Add adapter
                </button>
              ) : null}
            </header>
            <div className="panel-body">
              {!(board?.adapters || []).length ? (
                <InspectionEmptyState title="No adapters" description="Register webhook, NERIS, calendar, CAD, GIS, or accounting adapters." />
              ) : (
                <div className="personnel-list">
                  {(board.adapters || []).map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.name}</strong>
                        <small className="occupancy-muted"> {row.adapterType} · {row.endpoint || "no endpoint"}</small>
                      </span>
                      <div className="occupancy-detail-actions">
                        <InspectionStatusBadge status={row.status} />
                        {canManage ? (
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={saving}
                            onClick={() => run(
                              () => testInspectionIntegrationAdapter(departmentId, row.id, actor),
                              (result) => result?.lastTestResult || "Adapter tested."
                            )}
                          >
                            Test
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {runPreview ? (
          <section className="panel">
            <header>
              <div>
                <strong>{runPreview.dryRun ? "Dry run" : "Run"} result</strong>
                <small className="occupancy-muted"> {runPreview.run?.message}</small>
              </div>
            </header>
            <div className="panel-body">
              {!(runPreview.matched || []).length ? (
                <p className="occupancy-muted">No matching records.</p>
              ) : (
                <div className="personnel-list">
                  {runPreview.matched.map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.label}</strong>
                        <small className="occupancy-muted"> {row.status}</small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && (board?.runs || []).length ? (
          <section className="panel">
            <header><div><strong>Recent automation runs</strong></div></header>
            <div className="panel-body">
              <div className="personnel-list">
                {(board.runs || []).slice(0, 10).map((row) => (
                  <div key={row.id} className="person-row">
                    <span>
                      <strong>{row.automationName}</strong>
                      <small className="occupancy-muted">
                        {" "}{row.dryRun ? "dry run" : "live"} · {row.matchedCount} matches · {row.message}
                      </small>
                    </span>
                    <small className="occupancy-muted">{formatWhen(row.createdAt)}</small>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </InspectionsModuleLayout>
    </InspectionPermissionGate>
  );
}
