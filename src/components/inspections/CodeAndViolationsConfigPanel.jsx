import { useEffect, useMemo, useState } from "react";
import { BookOpen, CirclePlus, Save, ShieldAlert } from "lucide-react";
import {
  ensureCodeLibrarySeeded,
  ensureViolationCatalogSeeded,
  saveCodeSection,
  saveCodeSet,
  saveLocalAmendment,
  saveViolationCatalogItem,
  searchCodeSections,
} from "../../lib/inspections/index.js";
import {
  getActiveAdoptedCodeProfile,
  getDepartmentCodeLibraryAccess,
} from "../../lib/codeLibrary/index.js";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * Configuration Studio panel for code library + violation catalog.
 */
export default function CodeAndViolationsConfigPanel({
  departmentId,
  actor,
  onMessage,
  onError,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subTab, setSubTab] = useState("sections");
  const [query, setQuery] = useState("");
  const [codeSets, setCodeSets] = useState([]);
  const [sections, setSections] = useState([]);
  const [amendments, setAmendments] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [selectedAmendmentId, setSelectedAmendmentId] = useState("");
  const [codeSetDraft, setCodeSetDraft] = useState(null);
  const [sectionDraft, setSectionDraft] = useState(null);
  const [catalogDraft, setCatalogDraft] = useState(null);
  const [amendmentDraft, setAmendmentDraft] = useState(null);
  const [platformAccess, setPlatformAccess] = useState(null);
  const [adoptedProfile, setAdoptedProfile] = useState(null);

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const library = await ensureCodeLibrarySeeded(departmentId, actor);
      const nextCatalog = await ensureViolationCatalogSeeded(departmentId, actor);
      const [access, profile] = await Promise.all([
        getDepartmentCodeLibraryAccess(departmentId).catch(() => null),
        getActiveAdoptedCodeProfile(departmentId).catch(() => null),
      ]);
      setPlatformAccess(access);
      setAdoptedProfile(profile);
      setCodeSets(library.codeSets);
      setSections(library.codeSections);
      setAmendments(library.amendments);
      setCatalog(nextCatalog);
      setCodeSetDraft(library.codeSets[0] ? { ...library.codeSets[0] } : null);
      setSelectedSectionId((current) => current || library.codeSections[0]?.id || "");
      setSelectedCatalogId((current) => current || nextCatalog[0]?.id || "");
      setSelectedAmendmentId((current) => current || library.amendments[0]?.id || "");
    } catch (loadError) {
      onError?.(loadError?.message || "Unable to load code library.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  useEffect(() => {
    const selected = sections.find((row) => row.id === selectedSectionId) || null;
    setSectionDraft(selected ? { ...selected } : null);
  }, [sections, selectedSectionId]);

  useEffect(() => {
    const selected = catalog.find((row) => row.id === selectedCatalogId) || null;
    setCatalogDraft(selected ? { ...selected } : null);
  }, [catalog, selectedCatalogId]);

  useEffect(() => {
    const selected = amendments.find((row) => row.id === selectedAmendmentId) || null;
    setAmendmentDraft(selected ? { ...selected } : null);
  }, [amendments, selectedAmendmentId]);

  const visibleSections = useMemo(
    () => searchCodeSections(sections, query),
    [sections, query]
  );

  async function withSave(fn, successMessage) {
    setSaving(true);
    onError?.("");
    try {
      await fn();
      onMessage?.(successMessage);
    } catch (saveError) {
      onError?.(saveError?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="code-violations-config">
      {loading ? (
        <div className="inspections-loading-state" role="status"><p>Loading code library...</p></div>
      ) : null}

      {!loading ? (
        <>
          <section className="panel" style={{ marginBottom: "1rem" }}>
            <header>
              <div><BookOpen size={15} /><strong>Platform Code Library adoption</strong></div>
            </header>
            <div className="panel-body">
              <p className="occupancy-muted" style={{ marginBottom: "0.5rem" }}>
                Adopted IFC / platform publications are separate from tenant-authored inspector summaries below.
              </p>
              <p style={{ fontSize: "0.875rem" }}>
                Module:{" "}
                <strong>{platformAccess?.moduleEnabled ? "enabled" : "disabled"}</strong>
                {" · "}
                Publications:{" "}
                <strong>{(platformAccess?.enabledPublicationIds || []).join(", ") || "none"}</strong>
                {" · "}
                Active adoption:{" "}
                <strong>
                  {adoptedProfile
                    ? `${adoptedProfile.primaryPublicationId || "—"} (${adoptedProfile.edition || "—"})`
                    : "not set"}
                </strong>
              </p>
            </div>
          </section>

          <p className="occupancy-muted">
            Tenant-authored inspector summaries only. Do not paste copyrighted code text into these fields.
          </p>

          {codeSetDraft ? (
            <section className="panel" style={{ marginBottom: "1rem" }}>
              <header>
                <div><BookOpen size={15} /><strong>Active code set</strong></div>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={saving}
                  onClick={() => withSave(async () => {
                    const saved = await saveCodeSet(departmentId, codeSetDraft, actor);
                    setCodeSets((current) => current.map((row) => (row.id === saved.id ? saved : row)));
                    setCodeSetDraft(saved);
                  }, "Code set saved.")}
                >
                  <Save size={14} /> Save code set
                </button>
              </header>
              <div className="panel-body occupancy-form-grid">
                <Field label="Name">
                  <input value={codeSetDraft.name || ""} onChange={(e) => setCodeSetDraft((c) => ({ ...c, name: e.target.value }))} />
                </Field>
                <Field label="Edition">
                  <input value={codeSetDraft.edition || ""} onChange={(e) => setCodeSetDraft((c) => ({ ...c, edition: e.target.value }))} />
                </Field>
                <Field label="Jurisdiction">
                  <input value={codeSetDraft.jurisdiction || ""} onChange={(e) => setCodeSetDraft((c) => ({ ...c, jurisdiction: e.target.value }))} />
                </Field>
                <Field label="Adoption ordinance">
                  <input value={codeSetDraft.adoptionOrdinance || ""} onChange={(e) => setCodeSetDraft((c) => ({ ...c, adoptionOrdinance: e.target.value }))} />
                </Field>
                <Field label="Authorized link" wide>
                  <input value={codeSetDraft.authorizedLink || ""} onChange={(e) => setCodeSetDraft((c) => ({ ...c, authorizedLink: e.target.value }))} />
                </Field>
                <Field label="Notes" wide>
                  <textarea rows={2} value={codeSetDraft.notes || ""} onChange={(e) => setCodeSetDraft((c) => ({ ...c, notes: e.target.value }))} />
                </Field>
              </div>
            </section>
          ) : null}

          <div className="config-studio-tabs" role="tablist">
            {[
              ["sections", "Code sections"],
              ["catalog", "Violation catalog"],
              ["amendments", "Local amendments"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={subTab === id ? "active" : ""}
                aria-selected={subTab === id}
                onClick={() => setSubTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {subTab === "sections" ? (
            <section className="personnel-workspace occupancy-workspace">
              <section className="panel">
                <header>
                  <div><strong>Sections</strong></div>
                  <input
                    className="config-inline-search"
                    placeholder="Search sections"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </header>
                <div className="panel-body">
                  <div className="personnel-list">
                    {visibleSections.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={item.id === selectedSectionId ? "person-row selected" : "person-row"}
                        onClick={() => setSelectedSectionId(item.id)}
                      >
                        <span>
                          <strong>{item.section} · {item.title}</strong>
                          <small>{item.chapter}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    disabled={saving}
                    onClick={() => withSave(async () => {
                      const saved = await saveCodeSection(departmentId, {
                        codeSetId: codeSets[0]?.id || "",
                        chapter: "General",
                        section: "NEW",
                        title: "New section",
                        shortInspectorSummary: "",
                        tenantDescription: "",
                      }, actor);
                      setSections((current) => [saved, ...current]);
                      setSelectedSectionId(saved.id);
                    }, "Section created.")}
                  >
                    <CirclePlus size={14} /> Add section
                  </button>
                </div>
              </section>

              {sectionDraft ? (
                <section className="panel">
                  <header>
                    <div><strong>Edit section</strong></div>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={saving}
                      onClick={() => withSave(async () => {
                        const saved = await saveCodeSection(departmentId, sectionDraft, actor);
                        setSections((current) => current.map((row) => (row.id === saved.id ? saved : row)));
                      }, "Section saved.")}
                    >
                      <Save size={14} /> Save
                    </button>
                  </header>
                  <div className="panel-body occupancy-form-grid">
                    <Field label="Section"><input value={sectionDraft.section || ""} onChange={(e) => setSectionDraft((c) => ({ ...c, section: e.target.value }))} /></Field>
                    <Field label="Title"><input value={sectionDraft.title || ""} onChange={(e) => setSectionDraft((c) => ({ ...c, title: e.target.value }))} /></Field>
                    <Field label="Chapter"><input value={sectionDraft.chapter || ""} onChange={(e) => setSectionDraft((c) => ({ ...c, chapter: e.target.value }))} /></Field>
                    <Field label="Default severity">
                      <select value={sectionDraft.defaultSeverity || "moderate"} onChange={(e) => setSectionDraft((c) => ({ ...c, defaultSeverity: e.target.value }))}>
                        {["low", "moderate", "high", "critical"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                    <Field label="Correction days">
                      <input type="number" min="0" value={sectionDraft.defaultCorrectionDays ?? 14} onChange={(e) => setSectionDraft((c) => ({ ...c, defaultCorrectionDays: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Inspector summary" wide>
                      <textarea rows={2} value={sectionDraft.shortInspectorSummary || ""} onChange={(e) => setSectionDraft((c) => ({ ...c, shortInspectorSummary: e.target.value }))} />
                    </Field>
                    <Field label="Tenant description" wide>
                      <textarea rows={3} value={sectionDraft.tenantDescription || ""} onChange={(e) => setSectionDraft((c) => ({ ...c, tenantDescription: e.target.value }))} />
                    </Field>
                    <Field label="Default corrective action" wide>
                      <textarea rows={2} value={sectionDraft.defaultCorrectiveAction || ""} onChange={(e) => setSectionDraft((c) => ({ ...c, defaultCorrectiveAction: e.target.value }))} />
                    </Field>
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}

          {subTab === "catalog" ? (
            <section className="personnel-workspace occupancy-workspace">
              <section className="panel">
                <header><div><ShieldAlert size={15} /><strong>Catalog</strong></div></header>
                <div className="panel-body">
                  <div className="personnel-list">
                    {catalog.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={item.id === selectedCatalogId ? "person-row selected" : "person-row"}
                        onClick={() => setSelectedCatalogId(item.id)}
                      >
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.codeCitation || "No citation"} · {item.severity}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    disabled={saving}
                    onClick={() => withSave(async () => {
                      const saved = await saveViolationCatalogItem(departmentId, {
                        name: "New catalog item",
                        category: "General",
                        codeSectionId: sections[0]?.id || "",
                        codeCitation: sections[0]?.section || "",
                        severity: "moderate",
                        standardCorrectionDays: 14,
                      }, actor);
                      setCatalog((current) => [saved, ...current]);
                      setSelectedCatalogId(saved.id);
                    }, "Catalog item created.")}
                  >
                    <CirclePlus size={14} /> Add catalog item
                  </button>
                </div>
              </section>

              {catalogDraft ? (
                <section className="panel">
                  <header>
                    <div><strong>Edit catalog item</strong></div>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={saving}
                      onClick={() => withSave(async () => {
                        const saved = await saveViolationCatalogItem(departmentId, catalogDraft, actor);
                        setCatalog((current) => current.map((row) => (row.id === saved.id ? saved : row)));
                      }, "Catalog item saved.")}
                    >
                      <Save size={14} /> Save
                    </button>
                  </header>
                  <div className="panel-body occupancy-form-grid">
                    <Field label="Name"><input value={catalogDraft.name || ""} onChange={(e) => setCatalogDraft((c) => ({ ...c, name: e.target.value }))} /></Field>
                    <Field label="Category"><input value={catalogDraft.category || ""} onChange={(e) => setCatalogDraft((c) => ({ ...c, category: e.target.value }))} /></Field>
                    <Field label="Code citation"><input value={catalogDraft.codeCitation || ""} onChange={(e) => setCatalogDraft((c) => ({ ...c, codeCitation: e.target.value }))} /></Field>
                    <Field label="Code section">
                      <select
                        value={catalogDraft.codeSectionId || ""}
                        onChange={(e) => {
                          const section = sections.find((row) => row.id === e.target.value);
                          setCatalogDraft((c) => ({
                            ...c,
                            codeSectionId: e.target.value,
                            codeCitation: section?.section || c.codeCitation,
                          }));
                        }}
                      >
                        <option value="">None</option>
                        {sections.map((section) => (
                          <option key={section.id} value={section.id}>{section.section} · {section.title}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Severity">
                      <select value={catalogDraft.severity || "moderate"} onChange={(e) => setCatalogDraft((c) => ({ ...c, severity: e.target.value }))}>
                        {["low", "moderate", "high", "critical"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                    <Field label="Correction days">
                      <input type="number" min="0" value={catalogDraft.standardCorrectionDays ?? 14} onChange={(e) => setCatalogDraft((c) => ({ ...c, standardCorrectionDays: Number(e.target.value) }))} />
                    </Field>
                    <label className="occupancy-primary-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(catalogDraft.immediateHazard)}
                        onChange={(e) => setCatalogDraft((c) => ({ ...c, immediateHazard: e.target.checked }))}
                      />
                      Immediate hazard
                    </label>
                    <label className="occupancy-primary-toggle">
                      <input
                        type="checkbox"
                        checked={catalogDraft.active !== false}
                        onChange={(e) => setCatalogDraft((c) => ({ ...c, active: e.target.checked }))}
                      />
                      Active
                    </label>
                    <Field label="Inspector description" wide>
                      <textarea rows={3} value={catalogDraft.inspectorDescription || ""} onChange={(e) => setCatalogDraft((c) => ({ ...c, inspectorDescription: e.target.value }))} />
                    </Field>
                    <Field label="Public description" wide>
                      <textarea rows={2} value={catalogDraft.publicDescription || ""} onChange={(e) => setCatalogDraft((c) => ({ ...c, publicDescription: e.target.value }))} />
                    </Field>
                    <Field label="Corrective action" wide>
                      <textarea rows={2} value={catalogDraft.correctiveAction || ""} onChange={(e) => setCatalogDraft((c) => ({ ...c, correctiveAction: e.target.value }))} />
                    </Field>
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}

          {subTab === "amendments" ? (
            <section className="personnel-workspace occupancy-workspace">
              <section className="panel">
                <header><div><strong>Amendments</strong></div></header>
                <div className="panel-body">
                  <div className="personnel-list">
                    {amendments.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={item.id === selectedAmendmentId ? "person-row selected" : "person-row"}
                        onClick={() => setSelectedAmendmentId(item.id)}
                      >
                        <span>
                          <strong>{item.title}</strong>
                          <small>{item.ordinanceReference || "No ordinance ref"}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    disabled={saving}
                    onClick={() => withSave(async () => {
                      const saved = await saveLocalAmendment(departmentId, {
                        codeSetId: codeSets[0]?.id || "",
                        codeSectionId: sections[0]?.id || "",
                        title: "New local amendment",
                        summary: "",
                        ordinanceReference: "",
                      }, actor);
                      setAmendments((current) => [saved, ...current]);
                      setSelectedAmendmentId(saved.id);
                    }, "Amendment created.")}
                  >
                    <CirclePlus size={14} /> Add amendment
                  </button>
                </div>
              </section>

              {amendmentDraft ? (
                <section className="panel">
                  <header>
                    <div><strong>Edit amendment</strong></div>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={saving}
                      onClick={() => withSave(async () => {
                        const saved = await saveLocalAmendment(departmentId, amendmentDraft, actor);
                        setAmendments((current) => current.map((row) => (row.id === saved.id ? saved : row)));
                      }, "Amendment saved.")}
                    >
                      <Save size={14} /> Save
                    </button>
                  </header>
                  <div className="panel-body occupancy-form-grid">
                    <Field label="Title"><input value={amendmentDraft.title || ""} onChange={(e) => setAmendmentDraft((c) => ({ ...c, title: e.target.value }))} /></Field>
                    <Field label="Ordinance reference"><input value={amendmentDraft.ordinanceReference || ""} onChange={(e) => setAmendmentDraft((c) => ({ ...c, ordinanceReference: e.target.value }))} /></Field>
                    <Field label="Linked section">
                      <select
                        value={amendmentDraft.codeSectionId || ""}
                        onChange={(e) => setAmendmentDraft((c) => ({ ...c, codeSectionId: e.target.value }))}
                      >
                        <option value="">None</option>
                        {sections.map((section) => (
                          <option key={section.id} value={section.id}>{section.section} · {section.title}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Platform code node id">
                      <input
                        value={amendmentDraft.codeNodeId || ""}
                        onChange={(e) => setAmendmentDraft((c) => ({ ...c, codeNodeId: e.target.value }))}
                        placeholder="e.g. ifc-2024_section_903.2"
                      />
                    </Field>
                    <Field label="Effective date">
                      <input type="date" value={amendmentDraft.effectiveDate || ""} onChange={(e) => setAmendmentDraft((c) => ({ ...c, effectiveDate: e.target.value }))} />
                    </Field>
                    <Field label="Summary" wide>
                      <textarea rows={4} value={amendmentDraft.summary || ""} onChange={(e) => setAmendmentDraft((c) => ({ ...c, summary: e.target.value }))} />
                    </Field>
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
