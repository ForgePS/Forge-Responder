/**
 * Offline preplan packages in FORGE FIELD: save a published preplan for use
 * without a signal, open it in the response view, and keep the saved ones up
 * to date.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudDownload, CloudOff, FileText, Loader2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import {
  OfflineNotAllowedError, downloadPackage, getPackage, getPackageFile, listPackages, removePackage, syncPackages,
} from "../fieldPreplanPackages.js";
import { packageFreshness } from "../../lib/preplans/offlinePackageModel.js";
import PreplanResponseView from "../../components/preplans/PreplanResponseView.jsx";
import { Banner, Confirm, Field, Screen, Section, cx, formatWhen } from "../ui.jsx";

function freshnessFor(meta) {
  return packageFreshness(meta, new Date(), { staleHours: meta?.staleHours || 24 });
}

function toneFor(state) {
  if (state === "expired") return "warn";
  if (state === "stale" || state === "outdated") return "warn";
  return "ok";
}

/** Saved packages for the signed-in person, reloaded on demand. */
export function usePackages() {
  const { snapshot } = useField();
  const [rows, setRows] = useState(null);
  const reload = useCallback(() => {
    listPackages(snapshot.departmentId, snapshot.uid).then(setRows).catch(() => setRows([]));
  }, [snapshot.departmentId, snapshot.uid]);
  useEffect(() => { reload(); }, [reload]);
  return [rows, reload];
}

/** On a preplan's page: whether it's saved for offline use, with Save / Update / Open. */
export function OfflinePlanCard({ plan }) {
  const { snapshot, caps, actor, online, navigate, toast } = useField();
  const [rows, reload] = usePackages();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const meta = (rows || []).find((row) => row.preplanId === plan.id);
  if (plan.source !== "preplan" || plan.pendingLocalId) return null;
  const published = Boolean(plan.publishedRevisionId);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const saved = await downloadPackage({ departmentId: snapshot.departmentId, uid: snapshot.uid, actor, caps, preplanId: plan.id });
      toast(saved.filesLeftOut ? `Saved for offline use (${saved.filesLeftOut} file${saved.filesLeftOut === 1 ? "" : "s"} left out)` : "Saved for offline use");
      reload();
    } catch (saveError) {
      setError(saveError?.message || "Couldn't save this preplan.");
    } finally {
      setBusy(false);
    }
  }

  const fresh = meta && !meta.damaged ? freshnessFor(meta) : null;
  return (
    <Section title="Offline copy">
      {rows === null ? <p className="fa-muted">Checking…</p> : null}
      {meta?.damaged ? <Banner tone="warn" title="The saved copy is damaged">{meta.error} Save it again.</Banner> : null}
      {fresh ? (
        <Banner tone={toneFor(fresh.state)} icon={<CloudOff size={22} />} title={`On this device · ${fresh.label}`}>
          Revision {meta.revisionNumber || ""} · updated {formatWhen(meta.syncedAt)} · expires {new Date(meta.expiresAt).toLocaleDateString()}
          {meta.fileCount ? ` · ${meta.fileCount} photo${meta.fileCount === 1 ? "" : "s"} and documents` : ""}
          {fresh.message ? <><br />{fresh.message}</> : null}
        </Banner>
      ) : null}
      {rows && !meta && published ? <p className="fa-muted">Save the approved plan, its floor plans, site map, current alerts, nearby hydrants and photos on this device for use without a signal.</p> : null}
      {rows && !published ? <p className="fa-muted">This preplan has no approved version yet, so it can&apos;t be saved for response.</p> : null}
      {error ? <Banner tone="warn" icon={<ShieldAlert size={22} />} title="Not saved">{error}</Banner> : null}
      <div className="fa-footer-row">
        {meta && !meta.damaged ? (
          <button type="button" className="fa-btn fa-btn-primary fa-btn-grow" onClick={() => navigate("planOffline", { planId: plan.id })}>
            <CloudOff size={20} /> Open offline copy
          </button>
        ) : null}
        {published ? (
          <button type="button" className={cx("fa-btn fa-btn-grow", meta ? "fa-btn-secondary" : "fa-btn-primary")} onClick={save} disabled={busy || !online}>
            {busy ? <Loader2 size={20} className="fa-spin" /> : <CloudDownload size={20} />} {meta ? "Update now" : "Save for offline"}
          </button>
        ) : null}
      </div>
      {!online && published && !meta ? <p className="fa-muted">Needs a connection to save.</p> : null}
    </Section>
  );
}

function PackageFiles({ dept, uid, preplanId, files }) {
  const [urls, setUrls] = useState({});
  const [problem, setProblem] = useState("");
  const stored = files.filter((row) => row.stored);
  useEffect(() => {
    let cancelled = false;
    const made = [];
    (async () => {
      const next = {};
      for (const file of stored.filter((row) => row.kind === "photo")) {
        try {
          const blob = await getPackageFile(dept, uid, preplanId, file);
          if (blob) { const url = URL.createObjectURL(blob); made.push(url); next[file.id] = url; }
        } catch (error) {
          setProblem(error?.message || "A photo couldn't be opened.");
        }
      }
      if (!cancelled) setUrls(next);
    })();
    return () => { cancelled = true; made.forEach((url) => URL.revokeObjectURL(url)); };
  }, [dept, uid, preplanId, files]); // eslint-disable-line react-hooks/exhaustive-deps

  async function open(file) {
    try {
      const blob = await getPackageFile(dept, uid, preplanId, file);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener");
      if (!opened) window.location.assign(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setProblem(error?.message || "This file couldn't be opened.");
    }
  }

  if (!stored.length) return null;
  return (
    <section className="prv-facts prv-files" aria-label="Photos and documents">
      <h2>Photos & documents</h2>
      {problem ? <p className="prv-note">{problem}</p> : null}
      <ul>
        {stored.map((file) => (
          <li key={file.id}>
            <button type="button" onClick={() => open(file)}>
              {urls[file.id] ? <img src={urls[file.id]} alt={file.description || file.name} /> : <FileText size={28} aria-hidden="true" />}
              <span>{file.description || file.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The saved package, in the response view. Works with no signal. */
export function PlanOfflineScreen({ params = {} }) {
  const { snapshot, back } = useField();
  const [state, setState] = useState({ loading: true, pkg: null, error: "" });
  useEffect(() => {
    getPackage(snapshot.departmentId, snapshot.uid, params.planId)
      .then((pkg) => setState({ loading: false, pkg, error: pkg ? "" : "This preplan isn't saved on this device." }))
      .catch((error) => setState({ loading: false, pkg: null, error: error?.message || "The saved copy couldn't be opened." }));
  }, [snapshot.departmentId, snapshot.uid, params.planId]);

  const data = useMemo(() => {
    if (!state.pkg) return null;
    const content = state.pkg.content;
    return {
      revision: { ...content.revision, id: state.pkg.revisionId },
      buildings: content.buildings,
      catalog: content.catalog,
      alerts: content.alerts,
      siteMap: content.siteMap,
      hydrantRows: content.hydrantRows,
    };
  }, [state.pkg]);

  if (state.loading) return <Screen title="Offline copy" onBack={back}><p className="fa-muted">Opening…</p></Screen>;
  if (!state.pkg) return <Screen title="Offline copy" onBack={back}><Banner tone="warn" title="Can't open the offline copy">{state.error}</Banner></Screen>;
  const fresh = packageFreshness(state.pkg, new Date(), { staleHours: state.pkg.staleHours || 24 });
  return (
    <PreplanResponseView
      departmentId={snapshot.departmentId}
      preplan={state.pkg.content.preplan}
      data={data}
      offline={{ ...fresh, syncedAt: state.pkg.syncedAt, expiresAt: state.pkg.expiresAt }}
      onClose={back}
      footer={<PackageFiles dept={snapshot.departmentId} uid={snapshot.uid} preplanId={state.pkg.preplanId} files={state.pkg.content.files || []} />}
    />
  );
}

/** Every preplan saved on this device: freshness, update all, save many, remove. */
export function OfflinePlansScreen() {
  const { snapshot, caps, actor, online, navigate, back, toast, refData } = useField();
  const [rows, reload] = usePackages();
  const [busy, setBusy] = useState("");
  const [station, setStation] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [notice, setNotice] = useState(null);
  const [blocked, setBlocked] = useState("");
  const dept = snapshot.departmentId;
  const uid = snapshot.uid;

  const published = useMemo(() => refItems(refData, "preplans").filter((plan) => plan.publishedRevisionId), [refData]);
  const stations = useMemo(() => [...new Set(published.map((plan) => plan.station).filter(Boolean))].sort(), [published]);
  const saved = new Set((rows || []).map((row) => row.preplanId));
  const toSave = published.filter((plan) => !saved.has(plan.id) && (!station || plan.station === station));

  async function updateAll() {
    setBusy("update");
    try {
      const result = await syncPackages({ departmentId: dept, uid, actor, caps });
      if (result.wiped) setNotice({ tone: "warn", title: "Offline preplans removed", text: result.wiped });
      else {
        const parts = [`${result.updated + result.replaced} updated`];
        if (result.replaced) parts.push(`${result.replaced} with a newer approved version`);
        if (result.removed.length) parts.push(`${result.removed.length} removed (${result.removed.map((row) => `${row.name}: ${row.reason}`).join("; ")})`);
        if (result.failed.length) parts.push(`${result.failed.length} couldn't update (${result.failed.map((row) => row.name).join(", ")})`);
        setNotice({ tone: result.failed.length ? "warn" : "ok", title: "Offline preplans", text: `${parts.join(" · ")}.` });
      }
    } catch (error) {
      setNotice({ tone: "warn", title: "Couldn't update", text: error?.message || "Try again with a better signal." });
    } finally {
      setBusy("");
      reload();
    }
  }

  async function saveMany() {
    setBusy("save");
    let ok = 0;
    const failed = [];
    for (const plan of toSave) {
      try {
        await downloadPackage({ departmentId: dept, uid, actor, caps, preplanId: plan.id });
        ok += 1;
      } catch (error) {
        if (error instanceof OfflineNotAllowedError) {
          // About the device or the person, not this preplan: say it once and stop.
          setBlocked(error.message);
          setBusy("");
          reload();
          setNotice({ tone: "warn", title: ok ? `Saved ${ok}, then stopped` : "Can't save preplans on this device", text: error.message });
          return;
        }
        failed.push(`${plan.name}: ${error?.message || "failed"}`);
      }
    }
    setBusy("");
    reload();
    setNotice({ tone: failed.length ? "warn" : "ok", title: `Saved ${ok} preplan${ok === 1 ? "" : "s"}`, text: failed.length ? failed.slice(0, 5).join(" · ") : "" });
    if (!failed.length) toast(`Saved ${ok} preplans for offline use`);
  }

  const sorted = [...(rows || [])].sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  const attention = sorted.filter((row) => row.damaged || ["expired", "outdated"].includes(freshnessFor(row).state)).length;

  return (
    <Screen
      title="Offline preplans"
      subtitle={rows ? `${rows.length} on this device${attention ? ` · ${attention} need updating` : ""}` : ""}
      onBack={back}
      footer={(
        <div className="fa-footer-row">
          <button type="button" className="fa-btn fa-btn-secondary fa-btn-grow" onClick={updateAll} disabled={!online || Boolean(busy) || !rows?.length}>
            {busy === "update" ? <Loader2 size={20} className="fa-spin" /> : <RefreshCw size={20} />} Update all
          </button>
        </div>
      )}
    >
      {notice ? <Banner tone={notice.tone} title={notice.title}>{notice.text}</Banner> : null}
      {!online ? <Banner tone="info" icon={<CloudOff size={22} />} title="No connection">Saved preplans open without a signal. Updating needs a connection.</Banner> : null}

      <Section title="Save more" hint="Approved preplans only. They update whenever FORGE FIELD is online.">
        {stations.length > 1 ? (
          <Field label="Station">
            <select className="fa-input" value={station} onChange={(event) => setStation(event.target.value)}>
              <option value="">All stations</option>
              {stations.map((row) => <option key={row} value={row}>{row}</option>)}
            </select>
          </Field>
        ) : null}
        <button type="button" className="fa-btn fa-btn-primary fa-btn-block" onClick={saveMany} disabled={!online || Boolean(busy) || !toSave.length || Boolean(blocked)}>
          {busy === "save" ? <Loader2 size={20} className="fa-spin" /> : <CloudDownload size={20} />}
          {toSave.length ? ` Save ${toSave.length} preplan${toSave.length === 1 ? "" : "s"}${station ? ` for ${station}` : ""}` : " All approved preplans are saved"}
        </button>
      </Section>

      <Section title="On this device">
        {rows === null ? <p className="fa-muted">Loading…</p> : null}
        {rows && !rows.length ? <p className="fa-empty">No preplans saved yet.</p> : null}
        <div className="fa-list">
          {sorted.map((row) => {
            const fresh = row.damaged ? { state: "expired", label: "Damaged" } : freshnessFor(row);
            return (
              <div key={row.preplanId} className="fa-row-wrap">
                <button type="button" className="fa-row" disabled={row.damaged} onClick={() => navigate("planOffline", { planId: row.preplanId })}>
                  <span className="fa-row-icon"><CloudOff size={22} /></span>
                  <span className="fa-row-text">
                    <strong>{row.name}</strong>
                    <small>{row.address}{row.syncedAt ? ` · updated ${formatWhen(row.syncedAt)}` : ""}</small>
                  </span>
                  <span className={cx("fa-row-meta", fresh.state !== "current" && "is-warn")}>{fresh.label}</span>
                </button>
                <button type="button" className="fa-icon-btn" aria-label={`Remove ${row.name} from this device`} onClick={() => setConfirmRemove(row)}>
                  <Trash2 size={18} />
                </button>
              </div>
            );
          })}
        </div>
        <p className="fa-muted">
          Saved preplans are encrypted on this device and removed when you sign out. If your department revokes this
          device, they&apos;re removed the next time it connects. Satellite imagery isn&apos;t saved.
        </p>
      </Section>

      <Confirm
        open={Boolean(confirmRemove)}
        title="Remove from this device?"
        body={confirmRemove ? `${confirmRemove.name} won't be available without a signal until you save it again.` : ""}
        confirmLabel="Remove"
        onCancel={() => setConfirmRemove(null)}
        onConfirm={async () => {
          const row = confirmRemove;
          setConfirmRemove(null);
          await removePackage(dept, uid, row.preplanId).catch(() => null);
          setBlocked((current) => (/limit/.test(current) ? "" : current));
          reload();
        }}
      />
    </Screen>
  );
}
