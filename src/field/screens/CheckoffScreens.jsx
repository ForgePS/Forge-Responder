/** EMS unit and supply closet check-offs: pick a list, count items, flag shortages and expirations. */
import { useMemo } from "react";
import { CheckCheck, ChevronRight, ClipboardList, PackageOpen, Stethoscope } from "lucide-react";
import { useField, useRecordForm } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { localDate } from "../fieldValidation.js";
import { STATUS_LABELS, checkoffItemStatus, groupByCategory, summarizeCheckoff, validateCheckoff } from "../checkoffModel.js";
import { Banner, ErrorSummary, Field, Screen, Section, Stepper, TextArea, cx, formatWhen } from "../ui.jsx";

const KIND_META = {
  ems: { title: "EMS unit check-off", icon: Stethoscope, empty: "No EMS check-off lists yet. An administrator builds them in the RMS under Admin → FORGE Field." },
  supply: { title: "Supply closet check-off", icon: PackageOpen, empty: "No supply closet lists yet. An administrator builds them in the RMS under Admin → FORGE Field." },
};

const STATUS_TONE = { ok: "ok", short: "warn", missing: "bad", expired: "bad", expiring: "warn", unchecked: "muted" };

export function CheckoffListsScreen({ params = {} }) {
  const { refData, records, navigate, back } = useField();
  const kind = params.kind === "supply" ? "supply" : "ems";
  const meta = KIND_META[kind];
  const lists = refItems(refData, "checkoffLists").filter((list) => list.kind === kind);
  const lastDone = useMemo(() => {
    const map = new Map();
    records.filter((row) => row.kind === "checkoff" && row.status !== "draft").forEach((row) => {
      const prev = map.get(row.data?.listId);
      if (!prev || prev.at < row.data.completedAt) map.set(row.data.listId, { at: row.data.completedAt, result: row.data.result });
    });
    return map;
  }, [records]);
  const Icon = meta.icon;
  return (
    <Screen title={meta.title} subtitle="Pick what you're checking" onBack={back}>
      {!lists.length ? <Banner tone="info" icon={<ClipboardList size={22} />} title="Nothing to check yet">{meta.empty}</Banner> : null}
      <div className="fa-list">
        {lists.map((list) => {
          const last = lastDone.get(list.id);
          const today = last && localDate(new Date(last.at)) === localDate();
          return (
            <button key={list.id} type="button" className="fa-row" onClick={() => navigate("checkoffForm", { listId: list.id })}>
              <span className={cx("fa-row-icon", today && "is-done")}><Icon size={22} /></span>
              <span className="fa-row-text">
                <strong>{list.target} · {list.name}</strong>
                <small>{list.items.length} items{last ? ` · last ${formatWhen(last.at)} (${last.result})` : ""}</small>
              </span>
              <ChevronRight size={22} />
            </button>
          );
        })}
      </div>
    </Screen>
  );
}

function describe(data) {
  return {
    title: `${data.list?.target || ""} · ${data.list?.name || "Check-off"}`,
    subtitle: data.result || "In progress",
  };
}

export function CheckoffFormScreen({ params = {} }) {
  const { refData, snapshot, recent, back, rulesFor } = useField();
  const rules = rulesFor("checkoff");
  const listFromRef = refItems(refData, "checkoffLists").find((list) => list.id === params.listId) || null;
  const form = useRecordForm({
    kind: "checkoff",
    localId: params.localId,
    initialData: {
      listId: listFromRef?.id || "",
      list: listFromRef,
      entries: {},
      notes: "",
      performedBy: snapshot.displayName,
      shift: recent.shift || snapshot.assignedShift || "",
      completedAt: "",
      result: "",
    },
    describe,
    validate: (data) => {
      const errors = validateCheckoff(data.list, data.entries, { requireExpirations: rules.show("expirations") });
      if (rules.required("notes") && !String(data.notes || "").trim()) errors.notes = "Add a note.";
      return errors;
    },
  });
  const { data, update, errors, setErrors, submit, saving, existingStatus } = form;
  const today = localDate();
  const list = data.list;
  const readOnly = existingStatus === "synced" || existingStatus === "syncing";
  const summary = useMemo(() => (list ? summarizeCheckoff(list, data.entries, today) : null), [list, data.entries, today]);

  if (!list) {
    return (
      <Screen title="Check-off" onBack={back}>
        <Banner tone="warn" title="This list isn't on this device">Connect and tap Update on the home screen.</Banner>
      </Screen>
    );
  }

  const counted = list.items.filter((item) => data.entries[item.id]?.count !== undefined && data.entries[item.id]?.count !== "").length;
  const setEntry = (itemId, patch) => {
    update((current) => ({ entries: { ...current.entries, [itemId]: { ...(current.entries[itemId] || {}), ...patch } } }));
    setErrors((current) => {
      const next = { ...current };
      if (patch.count !== undefined) delete next[itemId];
      if (patch.expiration) delete next[`${itemId}:exp`];
      return next;
    });
  };
  const allAtPar = () => {
    update((current) => {
      const entries = { ...current.entries };
      list.items.forEach((item) => {
        if (entries[item.id]?.count === undefined || entries[item.id]?.count === "") entries[item.id] = { ...(entries[item.id] || {}), count: String(item.par) };
      });
      return { entries };
    });
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key.includes(":") || key === "notes")));
  };
  const problems = (summary?.counts.short || 0) + (summary?.counts.missing || 0) + (summary?.counts.expired || 0);

  return (
    <Screen
      title={list.target}
      subtitle={list.name}
      onBack={back}
      footer={readOnly ? null : (
        <>
          <ErrorSummary errors={errors} />
          <div className="fa-footer-row">
            <div className={cx("fa-result", problems ? "tone-bad" : summary?.counts.expiring ? "tone-warn" : counted === list.items.length ? "tone-ok" : "")}>
              {problems ? `${problems} to restock` : summary?.counts.expiring ? `${summary.counts.expiring} expiring` : `${counted}/${list.items.length} counted`}
            </div>
            <button
              type="button"
              className="fa-btn fa-btn-primary fa-btn-grow"
              disabled={saving}
              onClick={() => submit({
                recent: { shift: data.shift },
                finalize: (current) => {
                  const done = summarizeCheckoff(current.list, current.entries, localDate());
                  return { ...current, completedAt: current.completedAt || new Date().toISOString(), result: done.result };
                },
              })}
            >
              Finish check-off
            </button>
          </div>
        </>
      )}
    >
      <div className="fa-progress"><div className="fa-progress-bar" style={{ width: `${Math.round((counted / Math.max(1, list.items.length)) * 100)}%` }} /></div>
      {readOnly ? <Banner tone="ok" title="This check-off was sent">{summary?.result} · {formatWhen(data.completedAt)}</Banner> : null}
      {!readOnly && counted < list.items.length ? (
        <button type="button" className="fa-btn fa-btn-ghost fa-btn-block" onClick={allAtPar}>
          <CheckCheck size={20} /> Everything else is at par
        </button>
      ) : null}
      {groupByCategory(list.items).map((group) => (
        <Section key={group.category || "items"} title={group.category || "Items"}>
          <div className="fa-check-list">
            {group.items.map((item) => {
              const entry = data.entries[item.id] || {};
              const status = checkoffItemStatus(item, entry, today);
              return (
                <div key={item.id} className={cx("fa-check-item", ["short", "missing", "expired"].includes(status) && "is-fail")} data-error={errors[item.id] || errors[`${item.id}:exp`] ? "1" : undefined}>
                  <div className="fa-check-label fa-check-label-row">
                    <strong>{item.name}</strong>
                    <span className={cx("fa-status", `tone-${STATUS_TONE[status]}`)}>{STATUS_LABELS[status]}</span>
                  </div>
                  <div className="fa-count-row">
                    <span className="fa-par">Par {item.par}{item.unit ? ` ${item.unit}` : ""}</span>
                    <Stepper value={entry.count ?? ""} onChange={(value) => !readOnly && setEntry(item.id, { count: value })} ariaLabel={`${item.name} count`} />
                  </div>
                  {errors[item.id] ? <div className="fa-error-text">{errors[item.id]}</div> : null}
                  {item.tracksExpiration && rules.show("expirations") ? (
                    <Field label="Earliest expiration" error={errors[`${item.id}:exp`]}>
                      <input className="fa-input" type="date" value={entry.expiration || ""} disabled={readOnly} onChange={(event) => setEntry(item.id, { expiration: event.target.value })} />
                    </Field>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Section>
      ))}
      {rules.show("notes") ? (
        <Section title="Notes">
          <Field required={rules.required("notes")} error={errors.notes}>
            <TextArea value={data.notes} onChange={(value) => update({ notes: value })} placeholder="Anything to pass on (restock done, broken seal…)" disabled={readOnly} />
          </Field>
        </Section>
      ) : null}
      {summary?.restock.length ? (
        <Section title="Needs restock">
          <ul className="fa-restock">
            {summary.restock.map((row) => <li key={row.itemId}><strong>{row.need}{row.unit ? ` ${row.unit}` : ""}</strong> {row.name} <span>({STATUS_LABELS[row.reason].toLowerCase()})</span></li>)}
          </ul>
        </Section>
      ) : null}
    </Screen>
  );
}
