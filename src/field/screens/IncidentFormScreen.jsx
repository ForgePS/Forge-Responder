/**
 * FORGE FIELD incident report: the same NERIS report editor as the RMS
 * (Basics → Response → Scene → Details → Narrative → Review), saved on the
 * phone and sent when there's signal. Changes merge with the RMS copy field
 * by field; anything edited in both places is flagged to choose.
 */
import { Suspense, lazy, useMemo } from "react";
import { Loader2, Siren } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { latestSentCopy } from "../fieldRecords.js";
import { buildNewNerisReport } from "../../lib/neris/newReport.js";
import { applyReportChange } from "../../lib/neris/reportMerge.js";
import { autoPopulateReport } from "../../lib/neris/autoPopulation.js";
import { DEMO_DEPARTMENT_ID } from "../../lib/tenantPaths.js";
import { buildDemoCadRuns } from "../../data/demoCadRuns.js";
import { Banner, ErrorSummary, Screen, formatDay } from "../ui.jsx";

const NerisReportEditor = lazy(() => import("../../components/neris/NerisReportEditor.jsx"));

function describe(data) {
  return {
    title: `${data.incidentTypeSummary || "Incident"} — ${data.incidentAddress || "no address"}`,
    subtitle: [data.reportNumber, formatDay(data.incidentDate), data.workspace?.cad?.cadCallNumber || data.workspace?.cad?.incidentNumber].filter(Boolean).join(" · "),
  };
}

/** A new report made on the phone. Its number gets an F so it never clashes with the RMS counter. */
function newFieldReport() {
  const year = new Date().getFullYear();
  const stamp = Date.now().toString(36).toUpperCase();
  return buildNewNerisReport(`NERIS-${year}-F${stamp.slice(-5)}`, {
    id: `NERIS-F${stamp}${Math.random().toString(36).slice(2, 4).toUpperCase()}`,
  });
}

export default function IncidentFormScreen({ params = {} }) {
  const { refData, back, records, navigate, caps, snapshot, online } = useField();
  const downloaded = params.reportId ? refItems(refData, "incidents").find((report) => report.id === params.reportId) : null;
  const sent = params.reportId ? latestSentCopy(records, "incident", params.reportId, downloaded?.updatedAt) : null;
  const serverReport = sent ? { ...(downloaded || {}), ...sent.base, ...sent.data, id: params.reportId } : downloaded;
  const form = useRecordForm({
    kind: "incident",
    localId: params.localId,
    initialData: serverReport ? { ...serverReport } : newFieldReport(),
    base: serverReport ? { ...serverReport } : null,
    describe,
    validate: (data) => (data.incidentDate ? {} : { incidentDate: "Enter the incident date (Basics)." }),
  });
  const { data, update, errors, submit, saving } = form;

  // What the editor fills from: the same records the RMS uses, as downloaded to this phone.
  const sources = useMemo(() => {
    const apparatus = [
      ...refItems(refData, "assets").map((asset) => ({ id: asset.id, unit: asset.label, name: asset.label, type: asset.apparatusType || asset.type || "", station: asset.station || "" })),
      ...refItems(refData, "legacyUnits").map((unit) => ({ id: unit, unit, name: unit })),
    ].filter((row, index, all) => row.unit && all.findIndex((other) => other.unit === row.unit) === index);
    return {
      personnel: refItems(refData, "personnel"),
      apparatus,
      occupancies: [],
      preplans: refItems(refData, "preplans"),
      inspections: [],
      scheduleDays: [],
      hydrants: refItems(refData, "hydrants"),
      cadRuns: snapshot.departmentId === DEMO_DEPARTMENT_ID ? buildDemoCadRuns() : [],
    };
  }, [refData, snapshot.departmentId]);

  const onUpdate = (patch) => update((current) => applyReportChange(current, patch));
  const onUpdateModule = (moduleId, field, value) => update((current) => applyReportChange(current, {
    modules: { ...(current.modules || {}), [moduleId]: { ...(current.modules?.[moduleId] || {}), [field]: value } },
  }));

  return (
    <Screen
      title={data.reportNumber || "Incident report"}
      subtitle="Same report as the RMS · saved on this phone, sent when there's signal"
      onBack={back}
      wide
      footer={(
        <>
          <ErrorSummary errors={errors} />
          <button type="button" className="fa-btn fa-btn-primary fa-btn-block" disabled={saving} onClick={() => submit({ recent: { incidentUnits: (data.workspace?.units || []).map((unit) => unit.unitId) } })}>
            {online ? "Save and send" : "Save — sends when there's signal"}
          </button>
        </>
      )}
    >
      {serverReport ? <Banner tone="info" icon={<Siren size={22} />}>Changes merge into the report in the RMS. Anything someone else changed in the meantime is flagged for you to choose.</Banner> : null}
      <div className="fa-neris nr-page">
        <Suspense fallback={<div className="fa-map-loading" style={{ minHeight: 200 }}><Loader2 size={24} className="fa-spin" /></div>}>
          <NerisReportEditor
            report={data}
            allReports={refItems(refData, "incidents")}
            canEdit={caps.incidents}
            departmentId={snapshot.departmentId}
            online={online}
            reviewerName={snapshot.displayName || ""}
            sources={sources}
            onUpdate={onUpdate}
            onUpdateModule={onUpdateModule}
            onAutoPopulate={() => {
              const filled = autoPopulateReport(data, sources);
              onUpdate({ workspace: filled.workspace, autoPopulateSources: filled.autoPopulateSources });
            }}
            onRecordSubmission={() => {
              if (!window.confirm(`Have you submitted ${data.reportNumber} in the NERIS portal? This records it as submitted and locks the report.`)) return;
              onUpdate({ status: "Submitted", submittedAt: new Date().toISOString(), submissionMethod: "manual-neris-portal", locked: true });
            }}
            onClose={back}
            onOpenReport={(id) => navigate("incidentForm", { reportId: id })}
          />
        </Suspense>
      </div>
    </Screen>
  );
}
