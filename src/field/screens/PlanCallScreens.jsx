/**
 * Calls → preplan in FORGE FIELD: recent dispatches matched to approved
 * preplans (src/lib/preplans/incidentMatch.js). An exact address opens
 * straight away; anything else (a nearby building, several preplans at one
 * address, a similar street name) waits for the crew to confirm. Opening a
 * preplan for a call queues a record of which approved version was used, so
 * it also works offline from a saved copy.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, MapPin, Radio, RefreshCw } from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { listRecords, saveFieldRecord } from "../fieldRecords.js";
import { syncNow } from "../fieldSync.js";
import { incidentFrom, incidentKey, matchIncidentToPreplans } from "../../lib/preplans/incidentMatch.js";
import { Banner, Screen, Section, cx, formatWhen } from "../ui.jsx";
import { usePackages } from "./PlanOfflineScreens.jsx";

const STATUS_LABEL = { matched: "Preplan", confirm: "Check", none: "No preplan" };

function useCallData() {
  const { refData } = useField();
  const part = refData?.parts?.callPreplans;
  const value = part?.items && !Array.isArray(part.items) ? part.items : { enabled: false, dispatches: [] };
  const plans = useMemo(
    () => refItems(refData, "preplans").map((plan) => ({ ...plan, facilityName: plan.name })),
    [refData],
  );
  return { enabled: value.enabled, dispatches: value.dispatches || [], fetchedAt: part?.fetchedAt || "", plans };
}

/** True when the Calls entry should show (preplans and the department's incident integration on). */
export function useCallPreplansEnabled() {
  const { caps } = useField();
  const { enabled } = useCallData();
  return Boolean(caps.preFirePlans && caps.preplanModule && enabled);
}

/** Recent calls, each with whether an approved preplan matches its address. */
export function CallsScreen() {
  const { navigate, back, refresh, online } = useField();
  const { enabled, dispatches, fetchedAt, plans } = useCallData();
  const rows = useMemo(
    () => dispatches.map((dispatch) => ({ dispatch, result: matchIncidentToPreplans(incidentFrom(dispatch), plans) })),
    [dispatches, plans],
  );
  const [busy, setBusy] = useState(false);

  async function update() {
    setBusy(true);
    try { await refresh?.(); } finally { setBusy(false); }
  }

  return (
    <Screen
      title="Calls"
      subtitle={fetchedAt ? `As of ${formatWhen(fetchedAt)}` : ""}
      onBack={back}
      footer={(
        <div className="fa-footer-row">
          <button type="button" className="fa-btn fa-btn-secondary fa-btn-grow" onClick={update} disabled={!online || busy}>
            <RefreshCw size={20} className={busy ? "fa-spin" : ""} /> Check for new calls
          </button>
        </div>
      )}
    >
      {!enabled ? <Banner tone="info" title="Not turned on">Matching calls to preplans is off for your department (Incident Integration).</Banner> : null}
      {!online ? <Banner tone="info" icon={<CloudOff size={22} />} title="No connection">These are the calls from the last update. New calls appear when FORGE FIELD is online.</Banner> : null}
      {enabled && !rows.length ? <p className="fa-empty">No calls in the last 24 hours.</p> : null}
      <div className="fa-list">
        {rows.map(({ dispatch, result }) => (
          <button
            key={`${dispatch.source}:${dispatch.id}`}
            type="button"
            className="fa-row"
            onClick={() => navigate("callPlan", { source: dispatch.source, callId: dispatch.id })}
          >
            <span className="fa-row-icon"><Radio size={22} /></span>
            <span className="fa-row-text">
              <strong>{dispatch.description || "Dispatch"}</strong>
              <small>{dispatch.address || "No address"} · {formatWhen(dispatch.sentAt)}</small>
              {result.match ? <small>{result.match.preplan.facilityName}</small> : null}
            </span>
            <span className={cx("fa-row-meta", result.status !== "matched" && "is-warn")}>{STATUS_LABEL[result.status]}</span>
          </button>
        ))}
      </div>
    </Screen>
  );
}

/** One call: the matched preplan, or the choices to confirm, and opening it. */
export function CallPlanScreen({ params = {} }) {
  const { snapshot, navigate, back, toast } = useField();
  const { dispatches, plans } = useCallData();
  const [packages] = usePackages();
  const [error, setError] = useState("");
  const dispatch = dispatches.find((row) => row.source === params.source && String(row.id) === String(params.callId));
  const incident = useMemo(() => (dispatch ? incidentFrom(dispatch) : null), [dispatch]);
  const result = useMemo(() => (incident ? matchIncidentToPreplans(incident, plans) : null), [incident, plans]);

  if (!dispatch || !result) {
    return <Screen title="Call" onBack={back}><Banner tone="warn" title="Call not found">It may be older than a day. Go back and check for new calls.</Banner></Screen>;
  }

  async function open(plan, method) {
    setError("");
    const saved = (packages || []).find((row) => row.preplanId === plan.id && !row.damaged);
    const revisionId = saved?.revisionId || plan.publishedRevisionId;
    try {
      const key = incidentKey(incident);
      const mine = await listRecords(snapshot.departmentId, snapshot.uid).catch(() => []);
      const already = mine.some((row) => row.kind === "preplanIncidentLink" && row.data?.incidentKey === key && row.data?.preplanId === plan.id);
      if (!already) {
        await saveFieldRecord({
          departmentId: snapshot.departmentId,
          uid: snapshot.uid,
          kind: "preplanIncidentLink",
          title: `${plan.name} used on a call`,
          subtitle: `${dispatch.description || "Dispatch"} · ${dispatch.address || ""}`,
          data: { incident: dispatch, incidentKey: key, preplanId: plan.id, revisionId, method },
        });
        syncNow().catch(() => undefined);
      }
    } catch (saveError) {
      // Recording use must never stand between a crew and the plan: open it anyway.
      toast?.(saveError?.message || "Couldn't record that this preplan was used.");
    }
    if (saved) navigate("planOffline", { planId: plan.id });
    else navigate("planView", { source: "preplan", planId: plan.id });
  }

  const tone = result.status === "matched" ? "ok" : result.status === "confirm" ? "warn" : "info";
  return (
    <Screen title={dispatch.description || "Call"} subtitle={`${dispatch.address || "No address"} · ${formatWhen(dispatch.sentAt)}`} onBack={back}>
      <Banner
        tone={tone}
        icon={result.status === "matched" ? <CheckCircle2 size={22} /> : result.status === "confirm" ? <AlertTriangle size={22} /> : <MapPin size={22} />}
        title={result.status === "matched" ? "Approved preplan for this address" : result.status === "confirm" ? "Check before using" : "No approved preplan"}
      >
        {result.message}
      </Banner>
      {error ? <Banner tone="warn" title="Couldn't open">{error}</Banner> : null}

      {result.match ? (
        <Section title="Preplan">
          <PlanChoice row={result.match} packages={packages} onOpen={() => open(result.match.preplan, result.match.method)} primary />
        </Section>
      ) : null}

      {result.status === "confirm" ? (
        <Section title="Is one of these the dispatched property?" hint="Only open one you've confirmed. A different address is not the call's location.">
          {result.candidates.map((row) => (
            <PlanChoice key={row.preplan.id} row={row} packages={packages} onOpen={() => open(row.preplan, "confirmed")} />
          ))}
        </Section>
      ) : null}

      {result.unapproved.length ? (
        <p className="fa-muted">A preplan for this address is being written or reviewed and isn&apos;t approved for response yet.</p>
      ) : null}
      {dispatch.units ? <p className="fa-muted">Units: {dispatch.units}</p> : null}
    </Screen>
  );
}

function PlanChoice({ row, packages, onOpen, primary = false }) {
  const plan = row.preplan;
  const saved = (packages || []).find((item) => item.preplanId === plan.id && !item.damaged);
  return (
    <div className={cx("fa-call-plan", primary && "is-primary", !row.sameAddress && "is-other")}>
      <strong>{plan.name}</strong>
      <small>{plan.address}{row.distance !== null ? ` · ${row.distance} m from the call` : ""}</small>
      <ul>{row.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      {!row.sameAddress ? <p className="fa-call-warn"><AlertTriangle size={16} /> Different address from the dispatch</p> : null}
      <button type="button" className={cx("fa-btn fa-btn-block", primary ? "fa-btn-primary" : "fa-btn-secondary")} onClick={onOpen}>
        {saved ? <CloudOff size={20} /> : <MapPin size={20} />} {primary ? "Open preplan" : "Yes, open this preplan"}{saved ? " (saved copy)" : ""}
      </button>
    </div>
  );
}
