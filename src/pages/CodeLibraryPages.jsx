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
import { createViolation } from "../lib/inspections/violationService.js";
import {
  canCiteCodeSections,
  canManageAdoptedCodes,
  canManageCodeLibrary,
  canViewCodeLibrary,
} from "../lib/inspections/inspectionPermissions.js";

function Panel({ title, children, actions }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function AccessDenied({ name }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
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
          const rows = await listCodeNodes(publicationId, { max: 1000 });
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
          max: 1000,
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
    try {
      window.sessionStorage.setItem("forgePendingCodeCitation", JSON.stringify(payload));
      setMessage(`Queued ${selected.number} for inspection. Open an inspection and apply the pending citation.`);
      onNavigate?.("Work Queue");
    } catch {
      setMessage("Unable to queue citation for inspection.");
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
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        Code Library is disabled for this department. Ask a Creator to enable it under Code Administration.
      </div>
    );
  }

  const treeNodes = nodes.filter((n) => n.nodeType !== "commentary" || showCommentary);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {mode === "search" ? "Search Codes" : "Browse Codes"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            2024 IFC structured library — citations snapshot onto violations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => onNavigate?.("Adopted Codes")}>
            Adopted Codes
          </button>
          <button type="button" className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => onNavigate?.("Code Administration")}>
            Code Administration
          </button>
        </div>
      </div>

      {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      <form onSubmit={runSearch} className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search section #, title, or keyword (e.g. 903.2, sprinkler)"
          className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
          <Search className="h-3.5 w-3.5" /> Search
        </button>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={showCommentary} onChange={(e) => setShowCommentary(e.target.checked)} />
          Show commentary
        </label>
      </form>

      {history.length ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-slate-500">Recent:</span>
          {history.map((item) => (
            <button
              key={item.id}
              type="button"
              className="rounded-full border border-slate-200 px-2 py-1"
              onClick={() => {
                setQuery(item.query);
              }}
            >
              {item.query}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
        <Panel title="Hierarchy">
          <label className="mb-2 block text-xs font-semibold text-slate-500">Chapter</label>
          <select
            value={chapterNumber}
            onChange={(e) => setChapterNumber(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.number}>
                Ch {chapter.number} — {chapter.title}
              </option>
            ))}
          </select>
          <div className="max-h-[60vh] space-y-1 overflow-auto text-sm">
            {treeNodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedId(node.id)}
                className={`block w-full rounded-md px-2 py-1.5 text-left ${
                  selectedId === node.id ? "bg-red-50 font-semibold text-red-800" : "hover:bg-slate-50"
                }`}
              >
                <span className="font-mono text-[11px] text-slate-500">{node.number}</span>{" "}
                {node.title}
              </button>
            ))}
            {!treeNodes.length ? (
              <p className="text-xs text-slate-500">
                {error
                  ? "Unable to load hierarchy. See error above."
                  : loading
                    ? "Loading sections…"
                    : "No nodes yet. Publish the IFC import or preview seed under Code Administration."}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel title={selected ? `${selected.number} ${selected.title}` : "Section detail"}>
          {searchResults.length ? (
            <div className="mb-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search results</p>
              {searchResults.map((row) => (
                <button
                  key={row.node.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(row.node.id);
                    setChapterNumber(row.node.chapterNumber || chapterNumber);
                  }}
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-slate-400"
                >
                  <div className="text-sm font-semibold">{row.node.number} — {row.node.title}</div>
                  <div className="mt-1 text-xs text-slate-600">{row.preview}</div>
                </button>
              ))}
            </div>
          ) : null}

          {selected ? (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-slate-500">
                {selected.nodeType} · Ch {selected.chapterNumber || "—"} · {selected.publicationId}
              </p>
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 leading-relaxed text-slate-800">
                {selected.bodyText || "No body text stored for this node yet."}
              </div>
              {compareResult ? (
                <div className="rounded-lg border border-slate-200 p-3 text-xs">
                  <p className="font-semibold">Edition compare</p>
                  <p className="mt-1">
                    Changed: {String(compareResult.changed)} · Only left: {String(compareResult.onlyInLeft)} · Only
                    right: {String(compareResult.onlyInRight)}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a section from the hierarchy or search results.</p>
          )}
        </Panel>

        <Panel title="Actions">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={!selected || !canCiteCodeSections(permissions, isCreator)}
              onClick={handleCreateViolation}
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              <Gavel className="h-3.5 w-3.5" /> Create violation
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={handleAddToInspection}
              className="inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              Add to inspection
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={handleSaveSection}
              className="inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              <BookmarkPlus className="h-3.5 w-3.5" /> Save section
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={handleCopyCitation}
              className="inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" /> Copy citation
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={() => onNavigate?.("Local Amendments")}
              className="inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              View amendment
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={handleReportIssue}
              className="inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"
            >
              Report extraction issue
            </button>
            <div className="mt-2 border-t border-slate-100 pt-3">
              <p className="mb-1 text-xs font-semibold text-slate-500">Compare edition</p>
              <input
                value={compareEdition}
                onChange={(e) => setCompareEdition(e.target.value)}
                placeholder="Other publication id"
                className="mb-2 w-full rounded border px-2 py-1 text-xs"
              />
              <button type="button" disabled={!selected || !compareEdition} onClick={handleCompare} className="w-full rounded border px-2 py-1.5 text-xs disabled:opacity-40">
                Compare
              </button>
            </div>
            {saved.length ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">Saved / frequent</p>
                <div className="space-y-1">
                  {saved.slice(0, 8).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-50"
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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Adopted Codes</h1>
      <p className="text-sm text-slate-600">
        Configure which Creator-enabled publications this jurisdiction adopts. Historical inspections keep their
        citation snapshots.
      </p>
      {!access?.moduleEnabled ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Code Library module is not enabled for this department yet.
        </p>
      ) : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <form onSubmit={handleSave} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
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
          <label key={key} className="text-xs font-semibold text-slate-600">
            {label}
            <input
              disabled={!canEdit}
              value={form[key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            />
          </label>
        ))}
        <label className="text-xs font-semibold text-slate-600">
          Primary publication
          <select
            disabled={!canEdit}
            value={form.primaryPublicationId}
            onChange={(e) => setForm((prev) => ({ ...prev, primaryPublicationId: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
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
        <label className="md:col-span-2 text-xs font-semibold text-slate-600">
          Notes
          <textarea
            disabled={!canEdit}
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
            rows={3}
          />
        </label>
        {canEdit ? (
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white md:col-span-2 md:w-fit">
            Save adopted code profile
          </button>
        ) : null}
      </form>

      <Panel title="Profiles">
        <div className="space-y-2 text-sm">
          {profiles.map((profile) => (
            <div key={profile.id} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="font-semibold">
                {profile.jurisdictionName || profile.id}{" "}
                <span className="text-xs font-normal text-slate-500">{profile.active ? "active" : "inactive"}</span>
              </div>
              <div className="text-xs text-slate-600">
                {profile.primaryPublicationId} · {profile.edition} · effective {profile.effectiveDate || "—"}
              </div>
            </div>
          ))}
          {!profiles.length ? <p className="text-xs text-slate-500">No adopted profiles yet.</p> : null}
        </div>
      </Panel>
    </div>
  );
}

export function CodeAdministrationPage({ onNavigate }) {
  const { permissions, isCreator } = useAuth();
  const departmentId = useDepartmentId();
  const actor = useActor();
  const allowed = canManageCodeLibrary(permissions, isCreator);

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
      setMessage(`Published preview seed (${result.written} nodes). Run scripts/ifc for full DOCX import.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return <AccessDenied name="Code Administration" />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Code Administration</h1>
      <p className="text-sm text-slate-600">
        Creator controls which code libraries are available to this department. See{" "}
        <code className="rounded bg-slate-100 px-1">docs/inspections/code-library-runbook.md</code>.
      </p>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <Panel title="Department availability" actions={null}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => handleEnableModule(true)}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          >
            Enable module
          </button>
          <button type="button" disabled={busy} onClick={() => handleEnableModule(false)} className="rounded-lg border px-3 py-2 text-xs font-semibold">
            Disable module
          </button>
          <button type="button" disabled={busy} onClick={handleEnableIfc} className="rounded-lg border px-3 py-2 text-xs font-semibold">
            Enable 2024 IFC
          </button>
          <button type="button" disabled={busy} onClick={handlePublishSeed} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold">
            <BookOpen className="h-3.5 w-3.5" /> Publish preview seed
          </button>
          <button type="button" onClick={() => onNavigate?.("Browse Codes")} className="rounded-lg border px-3 py-2 text-xs font-semibold">
            Open browser
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-600">
          Module: {access?.moduleEnabled ? "enabled" : "disabled"} · Publications:{" "}
          {(access?.enabledPublicationIds || []).join(", ") || "none"}
        </p>
      </Panel>

      <Panel title="Publications">
        <div className="space-y-2 text-sm">
          {publications.map((pub) => (
            <div key={pub.id} className="rounded-lg border border-slate-200 px-3 py-2">
              <div className="font-semibold">
                {pub.name} <span className="text-xs font-normal text-slate-500">{pub.status}</span>
              </div>
              <div className="text-xs text-slate-600">
                {pub.id} · edition {pub.edition} · nodes {pub.nodeCount || 0} · hash {pub.sourceHash ? `${pub.sourceHash.slice(0, 12)}…` : "—"}
              </div>
            </div>
          ))}
          {!publications.length ? <p className="text-xs text-slate-500">No publications yet.</p> : null}
        </div>
      </Panel>

      <Panel title="Import batches">
        <div className="space-y-2 text-sm">
          {batches.map((batch) => (
            <div key={batch.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
              <div className="font-semibold">{batch.id}</div>
              <div>{batch.previewSummary || batch.sourceFilename}</div>
              <div className="text-slate-500">{batch.createdAt}</div>
            </div>
          ))}
          {!batches.length ? (
            <p className="text-xs text-slate-500">
              No import batches. Use <code>node scripts/ifc/parseIfcDocx.mjs</code> then publish.
            </p>
          ) : null}
        </div>
      </Panel>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" /> Licensing
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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Frequently Used & Saved Sections</h1>
      <Panel title="Frequent">
        {frequent.map((row) => (
          <div key={row.id} className="border-b border-slate-100 py-2 text-sm">
            {row.sectionNumber} — {row.sectionTitle} <span className="text-xs text-slate-500">×{row.useCount || 0}</span>
          </div>
        ))}
        {!frequent.length ? <p className="text-xs text-slate-500">No frequent sections yet.</p> : null}
      </Panel>
      <Panel title="Saved">
        {saved.map((row) => (
          <div key={row.id} className="border-b border-slate-100 py-2 text-sm">
            {row.sectionNumber} — {row.sectionTitle || row.label}
          </div>
        ))}
        {!saved.length ? <p className="text-xs text-slate-500">No saved sections yet.</p> : null}
      </Panel>
    </div>
  );
}

export function LocalAmendmentsLibraryPage({ onNavigate }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Local Amendments</h1>
      <p className="text-sm text-slate-600">
        Local amendments continue to live with the tenant code catalog. Manage them in Configuration Studio → Codes &
        catalog, and link them when creating violations from the Code Library.
      </p>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"
        onClick={() => onNavigate?.("Configuration Studio")}
      >
        <Settings2 className="h-3.5 w-3.5" /> Open Configuration Studio
      </button>
    </div>
  );
}
