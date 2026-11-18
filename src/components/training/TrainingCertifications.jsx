import { useMemo, useState } from "react";
import { useTraining } from "./useTrainingData.js";
import { Badge, EmptyState, Section, Table } from "./TrainingUi.jsx";
import { credentialsFromCertifications } from "../../lib/training/trainingEvidence.js";

/**
 * Credentials come from the existing Certifications module (one database). This
 * view adds training context: expirations, which requirements rely on each
 * credential, and the people who are not qualified. Editing stays in Certifications.
 */
export default function TrainingCertifications({ go, compliance, onOpenCertifications }) {
  const t = useTraining();
  const [filter, setFilter] = useState("soon");
  const [q, setQ] = useState("");
  const creds = useMemo(() => credentialsFromCertifications(t.certifications, t.allPersonnel), [t.certifications, t.allPersonnel]);
  const today = new Date().toISOString().slice(0, 10);
  const days = (d) => (d ? Math.round((new Date(`${d}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000) : null);
  const rows = creds.map((c) => ({ ...c, days: days(c.expirationDate), person: t.allPersonnel.find((p) => String(p.id) === c.personId) }))
    .filter((c) => (filter === "soon" ? c.days !== null && c.days <= 90 : filter === "expired" ? c.days !== null && c.days < 0 : filter === "inactive" ? ["revoked", "suspended"].includes(String(c.status).toLowerCase()) : true))
    .filter((c) => !q || [c.name, c.person?.name, c.category].join(" ").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999));
  const credRules = t.requirements.filter((r) => r.kind === "credential");
  const notQualified = compliance.results.filter((r) => r.status === "not_qualified");
  const unlinked = t.certifications.filter((c) => !c.personnelId && !t.allPersonnel.some((p) => String(p.name || "").trim().toLowerCase() === String(c.person || "").trim().toLowerCase()));
  return (
    <div className="trn-page">
      <p className="trn-muted">Certifications, licenses and credentials are kept in the Certifications module; this page reads the same records. Operational authorizations (department sign-offs) are tracked separately as task books and skills.</p>
      <div className="trn-toolbar">
        <div className="segmented-control">{[["soon", "Expiring ≤90 days"], ["expired", "Expired"], ["inactive", "Suspended / revoked"], ["all", "All"]].map(([id, l]) => <button key={id} type="button" className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{l}</button>)}</div>
        <div className="trn-actions">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search credentials" aria-label="Search credentials" />
          {onOpenCertifications ? <button type="button" className="secondary-button" onClick={onOpenCertifications}>Open Certifications</button> : null}
        </div>
      </div>
      {!t.certifications.length ? <EmptyState title="No certifications on file">Add certifications in the Certifications module; they appear here automatically.</EmptyState> : (
        <Section title="Credentials">
          <Table rows={rows} empty="Nothing in this view."
            columns={[{ key: "p", label: "Member", render: (c) => c.person?.name || c.personId }, { key: "name", label: "Credential" }, { key: "category", label: "Category" }, { key: "issueDate", label: "Issued" }, { key: "expirationDate", label: "Expires" },
              { key: "days", label: "Days left", render: (c) => (c.days === null ? "—" : <Badge tone={c.days < 0 ? "critical" : c.days <= 30 ? "warning" : c.days <= 90 ? "info" : "success"}>{c.days < 0 ? `Expired ${-c.days}d` : `${c.days}d`}</Badge>) },
              { key: "status", label: "Status" },
              { key: "doc", label: "Document", render: (c) => (c.documentUrl ? <a href={c.documentUrl} target="_blank" rel="noreferrer">View</a> : "—") }]} />
        </Section>
      )}
      <Section title="Credential requirements">
        {credRules.length ? <Table rows={credRules} columns={[{ key: "name", label: "Requirement" }, { key: "credentialName", label: "Credential" }, { key: "nq", label: "Not qualified", render: (r) => notQualified.filter((x) => x.ruleId === r.id).length }]} onRowClick={() => go("compliance", { status: "not_qualified" })} />
          : <p className="trn-muted">No requirement uses a credential yet. Add one under Compliance → Requirements (type “Current credential”) to flag members who aren't qualified.</p>}
      </Section>
      {unlinked.length ? <p className="trn-callout warning">{unlinked.length} certification record{unlinked.length === 1 ? " isn't" : "s aren't"} linked to a personnel record and can't count toward anyone's compliance. Fix the name or link in Certifications.</p> : null}
    </div>
  );
}
