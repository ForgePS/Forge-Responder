import { useEffect, useState } from "react";
import {
  BookOpen,
  Copy,
  Gavel,
  BookmarkPlus,
  Search,
  Settings2,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import "../styles/code-library.css";
import {
  buildIfc2024PreviewSeed,
  canUsePublication,
  compareCodeEditions,
  enableIfc2024ForDepartment,
  ensureIfc2024PublicationStub,
  getActiveAdoptedCodeProfile,
  getCodeNode,
  getDepartmentCodeLibraryAccess,
  IFC_2024_PUBLICATION_ID,
  listAdoptedCodeProfiles,
  listChapters,
  listCodeNodes,
  listCodePublications,
  listFrequentSections,
  listImportBatches,
  listSavedSections,
  listSearchHistory,
  publishParsedLibrary,
  recordSearchHistory,
  saveAdoptedCodeProfile,
  saveDepartmentCodeLibraryAccess,
  saveSectionBookmark,
  searchCodeLibrary,
  reportCodeExtractionIssue,
} from "../lib/codeLibrary/index.js";
import { setPendingCodeCitation } from "../lib/codeLibrary/pendingCitation.js";
import { createViolation } from "../lib/inspections/violationService.js";
import {
  canCiteCodeSections,
  canManageAdoptedCodes,
  canViewCodeLibrary,
} from "../lib/inspections/inspectionPermissions.js";

function Panel({ title, children, actions }) {
  return (
    <section className="panel cl-panel">
      <header>
        <h2 className="cl-panel-title">{title}</h2>
        {actions}
      </header>
      <div className="cl-panel-body">{children}</div>
    </section>
  );
}

function AccessDenied({ name }) {
  return (
    <div className="cl-notice is-warning">
      You do not have permission to open {name}.
    </div>
  );
}

function useDepartmentId() {
  const { membership } = useAuth();
  return membership?.departmentId || membership?.activeDepartmentId || "";
}

function useActor() {
  const { user } = useAuth();
  return {
    actorUid: user?.uid || "",
    actorName: user?.displayName || user?.email || "User",
  };
}

export function CodeLibraryBrowsePage({ mode = "browse", onNavigate }) {
  const { permissions, isCreator, user } = useAuth();
  const departmentId = useDepartmentId();
  const actor = useActor();
  const allowed = canViewCodeLibrary(permissions, isCreator);

  const [access, setAccess] = useState(null);
  const [publicationId, setPublicationId] = useState(IFC_2024_PUBLICATION_ID);
  const [chapters, setChapters] = useState([]);
  const [chapterNumber, setChapterNumber] = useState("");
  const [nodes, setNodes] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState(null);
  const [showCommentary, setShowCommentary] = useState(true);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchSummary, setSearchSummary] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [saved, setSaved] = useState([]);
  const [compareEdition, setCompareEdition] = useState("");
  const [compareResult, setCompareResult] = useState(null);

  const selectedPublicationOk = canUsePublication(access, publicationId) || isCreator;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!allowed || !departmentId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const accessRow = await getDepartmentCodeLibraryAccess(departmentId);
        if (!active) return;
        setAccess(accessRow);

        const pubOk = canUsePublication(accessRow, publicationId) || isCreator;
        if (!pubOk) {
          setChapters([]);
          setNodes([]);
          return;
        }

        const [chapterRows, hist, savedRows] = await Promise.all([
          listChapters(publicationId),
          listSearchHistory(departmentId, user?.uid || "", 10).catch(() => []),
          listSavedSections(departmentId, user?.uid || "").catch(() => []),
        ]);
        if (!active) return;
        setChapters(chapterRows);
        setHistory(hist);
        setSaved(savedRows);
        if (chapterRows[0]) {
          setChapterNumber((current) => current || chapterRows[0].number);
        } else {
          // No chapter nodes — still load flat node list
          const rows = await listCodeNodes(publicationId);
          if (!active) return;
          setNodes(rows.filter((n) => showCommentary || n.nodeType !== "commentary"));
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load code library.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [allowed, departmentId, publicationId, user?.uid, isCreator, showCommentary]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedPublicationOk) return;
      if (!chapterNumber && chapters.length) return;
      try {
        const rows = await listCodeNodes(publicationId, {
          chapterNumber: chapterNumber || "",
        });
        if (!active) return;
        setNodes(rows.filter((n) => showCommentary || n.nodeType !== "commentary"));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load code sections.");
      }
    })();
    return () => {
      active = false;
    };
  }, [chapterNumber, chapters.length, publicationId, selectedPublicationOk, showCommentary]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedId) {
        setSelected(null);
        return;
      }
      const node = await getCodeNode(selectedId);
      if (active) setSelected(node);
    })();
    return () => {
      active = false;
    };
  }, [selectedId]);

  async function runSearch(event) {
    event?.preventDefault?.();
    if (!query.trim()) return;
    setError("");
    try {
      const result = await searchCodeLibrary(publicationId, {
        query,
        chapterNumber: mode === "browse" ? chapterNumber : "",
        includeCommentary: showCommentary,
        limit: 60,
      });
      setSearchResults(result.results);
      const scope = mode === "browse" && chapterNumber ? ` in chapter ${chapterNumber}` : "";
      const searched = Number(result.searchedCount || 0).toLocaleString();
      if (!result.totalMatches) {
        setSearchSummary(`No matches in ${searched} sections searched${scope}.`);
      } else if (result.totalMatches > result.results.length) {
        setSearchSummary(`Showing the best ${result.results.length} of ${Number(result.totalMatches).toLocaleString()} matches · ${searched} sections searched${scope}. Narrow your search to see more.`);
      } else {
        setSearchSummary(`${result.totalMatches} matches · ${searched} sections searched${scope}.`);
      }
      await recordSearchHistory(departmentId, user?.uid || "", query);
      setHistory(await listSearchHistory(departmentId, user?.uid || "", 10));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    }
  }

  async function handleCreateViolation() {
    if (!selected || !canCiteCodeSections(permissions, isCreator)) return;
    setMessage("");
    setError("");
    try {
      const profile = await getActiveAdoptedCodeProfile(departmentId);
      await createViolation(
        departmentId,
        {
          name: `${selected.number} — ${selected.title}`,
          codeCitation: selected.number,
          description: selected.bodyText?.slice(0, 1500) || selected.title,
          severity: "moderate",
          publicationId: selected.publicationId,
          edition: profile?.edition || "2024",
          sectionNumber: selected.number,
          sectionTitle: selected.title,
          citedText: selected.bodyText?.slice(0, 4000) || "",
          codeNodeId: selected.id,
          adoptedProfileId: profile?.id || "",
          includeCommentary: false,
        },
        actor,
      );
      setMessage(`Created violation citing ${selected.number}.`);
      await saveSectionBookmark(
        departmentId,
        {
          userId: user?.uid || "",
          publicationId: selected.publicationId,
          codeNodeId: selected.id,
          sectionNumber: selected.number,
          sectionTitle: selected.title,
          incrementUse: true,
        },
        actor,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create violation.");
    }
  }

  async function handleSaveSection() {
    if (!selected) return;
    await saveSectionBookmark(
      departmentId,
      {
        userId: user?.uid || "",
        publicationId: selected.publicationId,
        codeNodeId: selected.id,
        sectionNumber: selected.number,
        sectionTitle: selected.title,
        label: selected.title,
        incrementUse: true,
      },
      actor,
    );
    setSaved(await listSavedSections(departmentId, user?.uid || ""));
    setMessage(`Saved ${selected.number}.`);
  }

  async function handleCopyCitation() {
    if (!selected) return;
    const text = `${selected.number} ${selected.title}\n\n${selected.bodyText || ""}`.trim();
    await navigator.clipboard.writeText(text);
    setMessage("Citation copied.");
  }

  async function handleAddToInspection() {
    if (!selected) return;
    const payload = {
      publicationId: selected.publicationId,
      codeNodeId: selected.id,
      sectionNumber: selected.number,
      sectionTitle: selected.title,
      citedText: selected.bodyText?.slice(0, 4000) || "",
      citedAt: new Date().toISOString(),
    };
    if (setPendingCodeCitation(payload)) {
      setMessage(`${selected.number} is ready to cite. Open an inspection and choose "Issue violation" or "Use in field" on the code section banner.`);
      onNavigate?.("Work Queue");
    } else {
      setError("Couldn't hold this section for an inspection in this browser. Use Copy citation instead.");
    }
  }

  async function handleReportIssue() {
    if (!selected) return;
    const note = window.prompt("Describe the extraction / text issue:", "");
    if (note == null) return;
    try {
      await reportCodeExtractionIssue(
        departmentId,
        {
          publicationId: selected.publicationId,
          codeNodeId: selected.id,
          sectionNumber: selected.number,
          sectionTitle: selected.title,
          note,
          userId: user?.uid || "",
        },
        actor,
      );
      setMessage("Extraction issue reported.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to report issue.");
    }
  }

  async function handleCompare() {
    if (!selected || !compareEdition) return;
    const result = await compareCodeEditions(publicationId, compareEdition, selected.number);
    setCompareResult(result);
  }

  if (!allowed) return <AccessDenied name="Code Library" />;
  if (!access?.moduleEnabled && !isCreator) {
    return (
      <div className="cl-notice">
        Code Library isn't turned on for this department yet. Contact FORGE support to enable it.
      </div>
    );
  }

  const treeNodes = nodes.filter((n) => n.nodeType !== "commentary" || showCommentary);

  return (
    <div className="cl-page">
      <div className="cl-page-head">
        <div>
          <h1 className="cl-title">
            {mode === "search" ? "Search Codes" : "Browse Codes"}
          </h1>
          <p className="cl-subtitle">
            2024 IFC structured library — citations snapshot onto violations.
          </p>
        </div>
        <div className="cl-button-row">
          <button type="button" className="secondary-button" onClick={() => onNavigate?.("Adopted Codes")}>
            Adopted Codes
          </button>
          <button type="button" className="secondary-button" onClick={() => onNavigate?.("Code Administration")}>
            Code Administration
          </button>
        </div>
      </div>

      {message ? <p className="banner success">{message}</p> : null}
      {error ? <p className="banner error">{error}</p> : null}
      {loading ? <p className="cl-hint">Loading…</p> : null}

      <form onSubmit={runSearch} className="cl-search">
        <div className="rms-field cl-search-field">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search section #, title, or keyword (e.g. 903.2, sprinkler)"
        />
        </div>
        <button type="submit" className="primary-button">
          <Search size={14} /> Search
        </button>
        <label className="rms-check">
          <input type="checkbox" checked={showCommentary} onChange={(e) => setShowCommentary(e.target.checked)} />
          Show commentary
        </label>
      </form>

      {history.length ? (
        <div className="cl-chips">
          <span className="cl-hint">Recent:</span>
          {history.map((item) => (
            <button
              key={item.id}
              type="button"
              className="cl-chip"
              onClick={() => {
                setQuery(item.query);
              }}
            >
              {item.query}
            </button>
          ))}
        </div>
      ) : null}

      <div className="cl-browser-grid">
        <Panel title="Hierarchy">
          <label className="rms-field cl-chapter">
          <span>Chapter</span>
          <select
            value={chapterNumber}
            onChange={(e) => setChapterNumber(e.target.value)}
          >
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.number}>
                Ch {chapter.number} — {chapter.title}
              </option>
            ))}
          </select>
          </label>
          <div className="cl-tree">
            {treeNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedId(node.id)}
                className={`cl-tree-item${selectedId === node.id ? " is-active" : ""}`}
              >
                <span className="cl-node-number">{node.number}</span>{" "}
                {node.title}
              </button>
            ))}
            {!treeNodes.length ? (
              <p className="cl-hint">
                {error
                  ? "Unable to load hierarchy. See error above."
                  : loading
                    ? "Loading sections…"
                    : "No code sections are loaded yet. Contact FORGE support to load your adopted code books."}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel title={selected ? `${selected.number} ${selected.title}` : "Section detail"}>
          {searchSummary && !searchResults.length ? (
            <p className="cl-hint cl-gap-below">{searchSummary}</p>
          ) : null}
          {searchResults.length ? (
            <div className="cl-results">
              <p className="cl-section-label">Search results</p>
              {searchSummary ? <p className="cl-hint">{searchSummary}</p> : null}
              {searchResults.map((row) => (
                <button
                  key={row.node.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(row.node.id);
                    setChapterNumber(row.node.chapterNumber || chapterNumber);
                  }}
                  className="cl-result"
                >
                  <div className="cl-result-title">{row.node.number} — {row.node.title}</div>
                  <div className="cl-result-preview">{row.preview}</div>
                </button>
              ))}
            </div>
          ) : null}

          {selected ? (
            <div className="cl-detail">
              <p className="cl-hint">
                {selected.nodeType} · Ch {selected.chapterNumber || "—"} · {selected.publicationId}
              </p>
              <div className="cl-body-text">
                {selected.bodyText || "No body text stored for this node yet."}
              </div>
              {compareResult ? (
                <div className="cl-compare">
                  <p className="cl-row-title">Edition compare</p>
                  <p>
                    Changed: {String(compareResult.changed)} · Only left: {String(compareResult.onlyInLeft)} · Only
                    right: {String(compareResult.onlyInRight)}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="cl-hint">Select a section from the hierarchy or search results.</p>
          )}
        </Panel>

        <Panel title="Actions">
          <div className="cl-actions">
            <button
              type="button"
              disabled={!selected || !canCiteCodeSections(permissions, isCreator)}
              onClick={handleCreateViolation}
              className="primary-button"
            >
              <Gavel size={14} /> Create violation
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={handleAddToInspection}
              className="secondary-button"
            >
              Add to inspection
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={handleSaveSection}
              className="secondary-button"
            >
              <BookmarkPlus size={14} /> Save section
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={handleCopyCitation}
              className="secondary-button"
            >
              <Copy size={14} /> Copy citation
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={() => onNavigate?.("Local Amendments")}
              className="secondary-button"
            >
              View amendment
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={handleReportIssue}
              className="secondary-button"
            >
              Report extraction issue
            </button>
            <div className="cl-subsection">
              <label className="rms-field">
              <span>Compare edition</span>
              <input
                value={compareEdition}
                onChange={(e) => setCompareEdition(e.target.value)}
                placeholder="Other publication id"
              />
              </label>
              <button type="button" disabled={!selected || !compareEdition} onClick={handleCompare} className="secondary-button">
                Compare
              </button>
            </div>
            {saved.length ? (
              <div className="cl-subsection">
                <p className="cl-section-label">Saved / frequent</p>
                <div className="cl-link-list">
                  {saved.slice(0, 8).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="cl-link"
                      onClick={() => setSelectedId(row.codeNodeId)}
                    >
                      {row.sectionNumber} — {row.sectionTitle}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function AdoptedCodesPage() {
  const { permissions, isCreator } = useAuth();
  const departmentId = useDepartmentId();
  const actor = useActor();
  const allowed = canManageAdoptedCodes(permissions, isCreator) || canViewCodeLibrary(permissions, isCreator);
  const canEdit = canManageAdoptedCodes(permissions, isCreator);

  const [access, setAccess] = useState(null);
  const [publications, setPublications] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState({
    id: "primary",
    jurisdictionName: "",
    state: "",
    county: "",
    municipality: "",
    primaryPublicationId: IFC_2024_PUBLICATION_ID,
    edition: "2024",
    adoptionOrdinance: "",
    adoptionDate: "",
    effectiveDate: "",
    adoptedAppendices: "",
    secondaryPublicationIds: "",
    notes: "",
    active: true,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    const [accessRow, pubs, rows] = await Promise.all([
      getDepartmentCodeLibraryAccess(departmentId),
      listCodePublications(),
      listAdoptedCodeProfiles(departmentId),
    ]);
    setAccess(accessRow);
    setPublications(pubs);
    setProfiles(rows);
    const active = rows.find((r) => r.active) || rows[0];
    if (active) {
      setForm({
        id: active.id,
        jurisdictionName: active.jurisdictionName,
        state: active.state,
        county: active.county,
        municipality: active.municipality,
        primaryPublicationId: active.primaryPublicationId || IFC_2024_PUBLICATION_ID,
        edition: active.edition || "2024",
        adoptionOrdinance: active.adoptionOrdinance,
        adoptionDate: active.adoptionDate,
        effectiveDate: active.effectiveDate,
        adoptedAppendices: (active.adoptedAppendices || []).join(", "),
        secondaryPublicationIds: (active.secondaryPublicationIds || []).join(", "),
        notes: active.notes,
        active: active.active,
      });
    }
  }

  useEffect(() => {
    if (allowed && departmentId) reload().catch((err) => setError(err.message));
  }, [allowed, departmentId]);

  async function handleSave(event) {
    event.preventDefault();
    if (!canEdit) return;
    setError("");
    try {
      await saveAdoptedCodeProfile(
        departmentId,
        form.id || "primary",
        {
          ...form,
          adoptedAppendices: form.adoptedAppendices
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          secondaryPublicationIds: form.secondaryPublicationIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        actor,
      );
      setMessage("Adopted code profile saved.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  if (!allowed) return <AccessDenied name="Adopted Codes" />;

  return (
    <div className="cl-page">
      <h1 className="cl-title">Adopted Codes</h1>
      <p className="cl-subtitle">
        Configure which Creator-enabled publications this jurisdiction adopts. Historical inspections keep their
        citation snapshots.
      </p>
      {!access?.moduleEnabled ? (
        <p className="cl-notice is-warning">
          Code Library module is not enabled for this department yet.
        </p>
      ) : null}
      {message ? <p className="banner success">{message}</p> : null}
      {error ? <p className="banner error">{error}</p> : null}

      <form onSubmit={handleSave} className="panel cl-form">
        {[
          ["jurisdictionName", "Jurisdiction name"],
          ["state", "State"],
          ["county", "County"],
          ["municipality", "Municipality"],
          ["edition", "Edition"],
          ["adoptionOrdinance", "Adoption ordinance"],
          ["adoptionDate", "Adoption date"],
          ["effectiveDate", "Effective date"],
          ["adoptedAppendices", "Adopted appendices (comma-separated)"],
          ["secondaryPublicationIds", "Secondary publication ids (comma-separated)"],
        ].map(([key, label]) => (
          <label key={key} className="rms-field">
            <span>{label}</span>
            <input
              disabled={!canEdit}
              value={form[key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          </label>
        ))}
        <label className="rms-field">
          <span>Primary publication</span>
          <select
            disabled={!canEdit}
            value={form.primaryPublicationId}
            onChange={(e) => setForm((prev) => ({ ...prev, primaryPublicationId: e.target.value }))}
          >
            {(access?.enabledPublicationIds?.length
              ? publications.filter((p) => access.enabledPublicationIds.includes(p.id) || p.id === form.primaryPublicationId)
              : publications
            ).map((pub) => (
              <option key={pub.id} value={pub.id}>
                {pub.name} ({pub.edition || pub.id})
              </option>
            ))}
            {!publications.length ? <option value={IFC_2024_PUBLICATION_ID}>ifc-2024</option> : null}
          </select>
        </label>
        <label className="rms-field wide">
          <span>Notes</span>
          <textarea
            disabled={!canEdit}
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            rows={3}
          />
        </label>
        {canEdit ? (
          <button type="submit" className="primary-button cl-form-submit">
            Save adopted code profile
          </button>
        ) : null}
      </form>

      <Panel title="Profiles">
        <div className="cl-list">
          {profiles.map((profile) => (
            <div key={profile.id} className="cl-row">
              <div className="cl-row-title">
                {profile.jurisdictionName || profile.id}{" "}
                <span className="cl-tag">{profile.active ? "active" : "inactive"}</span>
              </div>
              <div className="cl-row-meta">
                {profile.primaryPublicationId} · {profile.edition} · effective {profile.effectiveDate || "—"}
              </div>
            </div>
          ))}
          {!profiles.length ? <p className="cl-hint">No adopted profiles yet.</p> : null}
        </div>
      </Panel>
    </div>
  );
}

export function CodeAdministrationPage({ onNavigate }) {
  const { isCreator } = useAuth();
  const departmentId = useDepartmentId();
  const actor = useActor();
  const allowed = Boolean(isCreator); // FORGE staff only

  const [access, setAccess] = useState(null);
  const [publications, setPublications] = useState([]);
  const [batches, setBatches] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    await ensureIfc2024PublicationStub();
    const [accessRow, pubs, batchRows] = await Promise.all([
      getDepartmentCodeLibraryAccess(departmentId),
      listCodePublications(),
      listImportBatches(IFC_2024_PUBLICATION_ID),
    ]);
    setAccess(accessRow);
    setPublications(pubs);
    setBatches(batchRows);
  }

  useEffect(() => {
    if (allowed && departmentId) reload().catch((err) => setError(err.message));
  }, [allowed, departmentId]);

  async function handleEnableModule(enabled) {
    setBusy(true);
    try {
      const next = await saveDepartmentCodeLibraryAccess(
        departmentId,
        {
          moduleEnabled: enabled,
          enabledPublicationIds: access?.enabledPublicationIds || [],
        },
        actor.actorUid,
      );
      setAccess(next);
      setMessage(enabled ? "Code Library enabled for this department." : "Code Library disabled.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEnableIfc() {
    setBusy(true);
    try {
      const next = await enableIfc2024ForDepartment(departmentId, actor.actorUid);
      setAccess(next);
      setMessage("2024 IFC enabled for this department.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePublishSeed() {
    setBusy(true);
    setError("");
    try {
      const seed = buildIfc2024PreviewSeed();
      const result = await publishParsedLibrary({
        publicationId: IFC_2024_PUBLICATION_ID,
        publication: seed.publication,
        nodes: seed.nodes,
        batch: {
          sourceFilename: "preview-seed",
          sourceHash: "preview",
          previewSummary: `Preview seed with ${seed.nodes.length} nodes`,
          stats: { nodeCount: seed.nodes.length },
        },
        actorUid: actor.actorUid,
      });
      setMessage(`Published the sample code book (${result.written} sections).`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return <AccessDenied name="Code Administration" />;

  return (
    <div className="cl-page">
      <h1 className="cl-title">Code Administration</h1>
      <p className="cl-subtitle">
        Choose which code books this department can search and cite during inspections.
      </p>
      {message ? <p className="banner success">{message}</p> : null}
      {error ? <p className="banner error">{error}</p> : null}

      <Panel title="Department availability" actions={null}>
        <div className="cl-button-row">
          <button
            type="button"
            disabled={busy}
            onClick={() => handleEnableModule(true)}
            className="primary-button"
          >
            Enable module
          </button>
          <button type="button" disabled={busy} onClick={() => handleEnableModule(false)} className="secondary-button">
            Disable module
          </button>
          <button type="button" disabled={busy} onClick={handleEnableIfc} className="secondary-button">
            Enable 2024 IFC
          </button>
          <button type="button" disabled={busy} onClick={handlePublishSeed} className="secondary-button">
            <BookOpen size={14} /> Publish sample code book
          </button>
          <button type="button" onClick={() => onNavigate?.("Browse Codes")} className="secondary-button">
            Open browser
          </button>
        </div>
        <p className="cl-hint cl-gap-above">
          Module: {access?.moduleEnabled ? "enabled" : "disabled"} · Publications:{" "}
          {(access?.enabledPublicationIds || []).join(", ") || "none"}
        </p>
      </Panel>

      <Panel title="Publications">
        <div className="cl-list">
          {publications.map((pub) => (
            <div key={pub.id} className="cl-row">
              <div className="cl-row-title">
                {pub.name} <span className="cl-tag">{pub.status}</span>
              </div>
              <div className="cl-row-meta">
                {pub.id} · edition {pub.edition} · nodes {pub.nodeCount || 0} · hash {pub.sourceHash ? `${pub.sourceHash.slice(0, 12)}…` : "—"}
              </div>
            </div>
          ))}
          {!publications.length ? <p className="cl-hint">No publications yet.</p> : null}
        </div>
      </Panel>

      <Panel title="Import batches">
        <div className="cl-list">
          {batches.map((batch) => (
            <div key={batch.id} className="cl-row">
              <div className="cl-row-title">{batch.id}</div>
              <div>{batch.previewSummary || batch.sourceFilename}</div>
              <div className="cl-row-meta">{batch.createdAt}</div>
            </div>
          ))}
          {!batches.length ? (
            <p className="cl-hint">
              No code book imports yet.
            </p>
          ) : null}
        </div>
      </Panel>

      <div className="cl-notice is-warning">
        <div className="cl-notice-title">
          <AlertTriangle size={16} /> Licensing
        </div>
        Import only the owner-supplied ICC file. Do not redistribute outside authorized tenants.
      </div>
    </div>
  );
}

export function CodeLibrarySavedPage() {
  const { permissions, isCreator, user } = useAuth();
  const departmentId = useDepartmentId();
  const allowed = canViewCodeLibrary(permissions, isCreator);
  const [saved, setSaved] = useState([]);
  const [frequent, setFrequent] = useState([]);

  useEffect(() => {
    if (!allowed || !departmentId) return;
    Promise.all([
      listSavedSections(departmentId, user?.uid || ""),
      listFrequentSections(departmentId, user?.uid || ""),
    ]).then(([a, b]) => {
      setSaved(a);
      setFrequent(b);
    });
  }, [allowed, departmentId, user?.uid]);

  if (!allowed) return <AccessDenied name="Saved Sections" />;

  return (
    <div className="cl-page">
      <h1 className="cl-title">Frequently Used & Saved Sections</h1>
      <Panel title="Frequent">
        {frequent.map((row) => (
          <div key={row.id} className="cl-list-row">
            {row.sectionNumber} — {row.sectionTitle} <span className="cl-hint">×{row.useCount || 0}</span>
          </div>
        ))}
        {!frequent.length ? <p className="cl-hint">No frequent sections yet.</p> : null}
      </Panel>
      <Panel title="Saved">
        {saved.map((row) => (
          <div key={row.id} className="cl-list-row">
            {row.sectionNumber} — {row.sectionTitle || row.label}
          </div>
        ))}
        {!saved.length ? <p className="cl-hint">No saved sections yet.</p> : null}
      </Panel>
    </div>
  );
}

export function LocalAmendmentsLibraryPage({ onNavigate }) {
  return (
    <div className="cl-page">
      <h1 className="cl-title">Local Amendments</h1>
      <p className="cl-subtitle">
        Local amendments continue to live with the tenant code catalog. Manage them in Configuration Studio → Codes &
        catalog, and link them when creating violations from the Code Library.
      </p>
      <button
        type="button"
        className="secondary-button"
        onClick={() => onNavigate?.("Configuration Studio")}
      >
        <Settings2 size={14} /> Open Configuration Studio
      </button>
    </div>
  );
}
