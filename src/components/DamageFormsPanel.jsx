import { doc, onSnapshot } from "firebase/firestore";
import { Download, ExternalLink, FileWarning, LoaderCircle, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildDamageFormListLabel,
  fetchJotformDamagePdf,
  formatDamageFormDate,
  resolveJotformPdfViewerUrl,
  subscribeDamageForms,
} from "../lib/damageFormService.js";
import { getFirestoreDb } from "../lib/firebaseClient.js";
import {
  base64ToPdfBlob,
  downloadBlob,
  printDamageFormRecord,
} from "../lib/damageFormPrint.js";

function DamageFormDetail({ record, departmentId = "", onClose }) {
  const [liveRecord, setLiveRecord] = useState(record);
  const [viewMode, setViewMode] = useState("details");
  const [pdfBlobUrl, setPdfBlobUrl] = useState("");
  const [pdfViewerUrl, setPdfViewerUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");

  const [pdfSource, setPdfSource] = useState("");
  const activeRecord = liveRecord || record;
  const sourceLabel = activeRecord.source === "jotform" ? "JotForm" : "Employee portal";
  const formTitle = activeRecord.formTitle || "Damage Form";
  const submissionUrl = activeRecord.viewUrl || "";
  const formUrl = activeRecord.formUrl || "";
  const hasAnswers = Array.isArray(activeRecord.answers) && activeRecord.answers.length > 0;
  const isJotform = activeRecord.source === "jotform";
  const pdfFilename = useMemo(
    () => `damage-form-${activeRecord.submissionId || activeRecord.id || "report"}.pdf`,
    [activeRecord.id, activeRecord.submissionId]
  );

  useEffect(() => {
    setLiveRecord(record);
  }, [record]);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db || !departmentId || !record?.id) return undefined;

    const ref = doc(db, "departments", departmentId, "damageForms", record.id);
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setLiveRecord({ id: snap.id, ...snap.data() });
      }
    });
  }, [departmentId, record?.id]);

  useEffect(() => {
    setViewMode("details");
    setPdfBlobUrl("");
    setPdfViewerUrl("");
    setPdfError("");
    setPdfLoading(false);
    setPdfSource("");
  }, [record.id]);

  useEffect(() => () => {
    if (pdfBlobUrl?.startsWith("blob:")) URL.revokeObjectURL(pdfBlobUrl);
  }, [pdfBlobUrl]);

  useEffect(() => {
    if (viewMode !== "pdf" || !activeRecord?.id) return undefined;

    let cancelled = false;
    setPdfError("");

    if (isJotform && activeRecord.submissionId) {
      setPdfViewerUrl(resolveJotformPdfViewerUrl(activeRecord));
      setPdfSource("jotform");
      setPdfLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (!departmentId) return undefined;

    setPdfLoading(true);
    fetchJotformDamagePdf(departmentId, {
      recordId: activeRecord.id,
      submissionId: activeRecord.submissionId,
      formId: activeRecord.formId,
    })
      .then((result) => {
        if (cancelled) return;
        const blob = base64ToPdfBlob(result.pdfBase64 || "");
        setPdfBlobUrl(URL.createObjectURL(blob));
        setPdfSource(result.source || "generated");
      })
      .catch((error) => {
        if (!cancelled) {
          setPdfError(error.message || "Could not load the PDF.");
        }
      })
      .finally(() => {
        if (!cancelled) setPdfLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewMode, departmentId, isJotform, activeRecord.id, activeRecord.submissionId, activeRecord.formId, activeRecord.publicPdfUrl]);

  const pdfFrameUrl = pdfViewerUrl || pdfBlobUrl;

  function handlePrint() {
    if (viewMode === "pdf" && pdfFrameUrl) {
      const frame = document.getElementById("damage-form-pdf-frame");
      if (frame?.contentWindow) {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        return;
      }
    }
    printDamageFormRecord(activeRecord);
  }

  function handleDownloadPdf() {
    if (pdfBlobUrl) {
      fetch(pdfBlobUrl)
        .then((response) => response.blob())
        .then((blob) => downloadBlob(blob, pdfFilename));
      return;
    }

    if (isJotform && activeRecord.submissionId) {
      const viewerUrl = resolveJotformPdfViewerUrl(activeRecord);
      if (viewerUrl) {
        window.open(viewerUrl, "_blank", "noopener,noreferrer")?.focus?.();
        return;
      }
    }

    if (!departmentId) return;

    setPdfLoading(true);
    fetchJotformDamagePdf(departmentId, {
      recordId: activeRecord.id,
      submissionId: activeRecord.submissionId,
      formId: activeRecord.formId,
    })
      .then((result) => {
        downloadBlob(base64ToPdfBlob(result.pdfBase64 || ""), result.filename || pdfFilename);
      })
      .catch((error) => {
        setPdfError(error.message || "Could not download the PDF.");
      })
      .finally(() => setPdfLoading(false));
  }

  return (
    <div className="modal-backdrop damage-form-backdrop" role="presentation" onClick={onClose}>
      <article
        className={`damage-form-modal${viewMode === "pdf" ? " damage-form-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="damage-form-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="damage-form-modal-header">
          <div>
            <span>{sourceLabel} · {formTitle}</span>
            <h2 id="damage-form-modal-title">{activeRecord.title || formTitle}</h2>
            <p>{formatDamageFormDate(activeRecord.submittedAt || activeRecord.receivedAt)}</p>
          </div>
          <button type="button" className="icon-close" onClick={onClose}>Close</button>
        </header>

        <div className="damage-form-modal-tabs">
          <button
            type="button"
            className={viewMode === "details" ? "active" : ""}
            onClick={() => setViewMode("details")}
          >
            Details
          </button>
          <button
            type="button"
            className={viewMode === "pdf" ? "active" : ""}
            onClick={() => setViewMode("pdf")}
          >
            PDF
          </button>
        </div>

        <div className="damage-form-modal-body">
          {viewMode === "pdf" ? (
            <>
              {pdfLoading ? (
                <p className="damage-form-status"><LoaderCircle size={16} className="dd-spin" /> Loading PDF…</p>
              ) : null}
              {pdfError ? (
                <p className="damage-form-status damage-form-status-error">{pdfError}</p>
              ) : null}
              {pdfFrameUrl ? (
                <iframe
                  id="damage-form-pdf-frame"
                  className="damage-form-frame"
                  src={pdfFrameUrl}
                  title={`${activeRecord.title || "Damage form"} PDF`}
                />
              ) : null}
              {!pdfLoading && !pdfFrameUrl && !pdfError ? (
                <p className="damage-form-empty-detail">PDF preview is not available for this submission.</p>
              ) : null}
            </>
          ) : (
            <>
              {activeRecord.submitterName ? (
                <p className="damage-form-meta"><strong>Submitted by:</strong> {activeRecord.submitterName}</p>
              ) : null}
              {activeRecord.summary ? (
                <p className="damage-form-summary">{activeRecord.summary}</p>
              ) : null}

              {hasAnswers ? (
                <dl className="damage-form-answers">
                  {activeRecord.answers.map((answer) => (
                    <div key={`${answer.label}-${answer.value}`}>
                      <dt>{answer.label || answer.field || "Answer"}</dt>
                      <dd>{answer.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="damage-form-empty-detail">No field details were captured for this submission.</p>
              )}
            </>
          )}
        </div>

        <footer className="damage-form-modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Close</button>
          <button type="button" className="secondary" onClick={handlePrint}>
            <Printer size={16} />
            Print
          </button>
          <button type="button" className="secondary" onClick={handleDownloadPdf} disabled={pdfLoading}>
            <Download size={16} />
            Download PDF
          </button>
          {submissionUrl ? (
            <button
              type="button"
              className="primary"
              onClick={() => window.open(submissionUrl, "_blank", "noopener,noreferrer")?.focus?.()}
            >
              <ExternalLink size={16} />
              View in JotForm
            </button>
          ) : null}
          {isJotform && activeRecord.submissionId ? (
            <button
              type="button"
              className="secondary"
              onClick={() => window.open(resolveJotformPdfViewerUrl(activeRecord), "_blank", "noopener,noreferrer")?.focus?.()}
            >
              <ExternalLink size={16} />
              Open official PDF
            </button>
          ) : null}
          {formUrl && formUrl !== submissionUrl ? (
            <button
              type="button"
              className="secondary"
              onClick={() => window.open(formUrl, "_blank", "noopener,noreferrer")?.focus?.()}
            >
              <ExternalLink size={16} />
              Open form
            </button>
          ) : null}
        </footer>
      </article>
    </div>
  );
}

export default function DamageFormsPanel({ departmentId = "" }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(Boolean(departmentId));
  const [error, setError] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    if (!departmentId) {
      setRecords([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubscribe = subscribeDamageForms(
      departmentId,
      (items) => {
        setRecords(items);
        setLoading(false);
        setError("");
      },
      () => {
        setError("Could not load damage forms.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [departmentId]);

  const visibleRecords = records
    .filter((item) => item.submissionId !== "999888777")
    .slice(0, 8);

  return (
    <>
      {loading ? (
        <p className="damage-form-status">Loading damage forms...</p>
      ) : error ? (
        <p className="damage-form-status damage-form-status-error">{error}</p>
      ) : visibleRecords.length ? (
        <div className="damage-forms-list">
          {visibleRecords.map((record) => (
            <button
              key={record.id}
              type="button"
              className="damage-form-row"
              onClick={() => setSelectedRecord(record)}
            >
              <span className="damage-form-row-date">
                {formatDamageFormDate(record.submittedAt || record.receivedAt)}
              </span>
              <strong className="damage-form-row-title">{buildDamageFormListLabel(record)}</strong>
              <span className="damage-form-row-submitter">
                {record.submitterName || (record.source === "jotform" ? "JotForm" : "Employee portal")}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="damage-form-empty">
          <FileWarning size={18} />
          <p>No active damage forms.</p>
          <p className="damage-form-setup-copy">
            New JotForm submissions and employee damage reports will appear here.
          </p>
        </div>
      )}

      {selectedRecord ? (
        <DamageFormDetail
          record={selectedRecord}
          departmentId={departmentId}
          onClose={() => setSelectedRecord(null)}
        />
      ) : null}
    </>
  );
}
