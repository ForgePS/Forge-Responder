import {
  AlertTriangle,
  Flame,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { FORM_FOR_KIND } from "../fieldKinds.js";
import { cardSummary, useQuickCards } from "../quickCards.jsx";
import { Banner, StatusChip, formatWhen } from "../ui.jsx";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(name = "") {
  const parts = String(name).trim().split(/\s+/);
  return parts.length > 1 && /^(chief|capt|captain|lt|lieutenant|ff|eng|engineer)\.?$/i.test(parts[0]) ? parts.slice(1).join(" ") : parts[0] || "";
}

/** A category on the home screen; opens its own screen of tools. */
function CategoryTile({ card, onOpen }) {
  const summary = cardSummary(card);
  const soon = card.items.every((item) => item.soon);
  return (
    <button type="button" className={`fa-cat tone-${card.tone}${soon ? " is-soon" : ""}`} onClick={onOpen}>
      <span className="fa-cat-icon">{card.icon}</span>
      <strong>{card.title}</strong>
      <small>{summary}</small>
    </button>
  );
}

export default function HomeScreen() {
  const { snapshot, refData, refLoading, refError, refresh, records, counts, navigate, online } = useField();
  const cards = useQuickCards().filter((card) => card.items.length);
  const drafts = records.filter((record) => record.status === "draft");
  const noData = !refData.fetchedAt;
  const hasWork = cards.some((card) => card.items.some((item) => item && !item.soon && !item.href));

  return (
    <div className="fa-screen">
      <div className="fa-hello">
        <h1>{greeting()}{firstName(snapshot.displayName) ? `, ${firstName(snapshot.displayName)}` : ""}</h1>
        <p>{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}{snapshot.assignedShift ? ` · ${snapshot.assignedShift}` : ""}</p>
      </div>

      {counts.attention ? (
        <Banner
          tone="warn"
          icon={<AlertTriangle size={22} />}
          title={`${counts.attention} record${counts.attention === 1 ? " needs" : "s need"} your attention`}
          action={<button type="button" className="fa-btn fa-btn-sm" onClick={() => navigate("activity", { filter: "attention" })}>Review</button>}
        >
          It's saved on this device and won't be lost.
        </Banner>
      ) : null}

      {noData ? (
        <Banner
          tone={online ? "info" : "warn"}
          icon={online ? <RefreshCw size={22} className={refLoading ? "fa-spin" : ""} /> : <WifiOff size={22} />}
          title={online ? "Downloading your department's field data…" : "Field data not downloaded yet"}
        >
          {online ? "Apparatus, checklists, hydrants and personnel are being saved on this device." : "Connect once so apparatus, checklists and hydrants are available offline."}
        </Banner>
      ) : null}

      {drafts.length ? (
        <section className="fa-section">
          <div className="fa-section-head"><h2>Pick up where you left off</h2></div>
          <div className="fa-list">
            {drafts.slice(0, 4).map((record) => (
              <button key={record.localId} type="button" className="fa-row" onClick={() => navigate(FORM_FOR_KIND[record.kind], { localId: record.localId })}>
                <span className="fa-row-text">
                  <strong>{record.title}</strong>
                  <small>{record.subtitle || "Started"} · {formatWhen(record.updatedAt)}</small>
                </span>
                <StatusChip status="draft" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="fa-cat-grid">
        {cards.map((card) => <CategoryTile key={card.key} card={card} onOpen={() => navigate("quickCard", { card: card.key })} />)}
      </div>
      {!hasWork ? (
        <Banner tone="info" icon={<Flame size={22} />} title="Nothing to do here yet">
          Your role or your department's plan doesn't include field workflows. Ask your administrator.
        </Banner>
      ) : null}

      <div className="fa-freshness">
        <span>
          {refData.fetchedAt ? `Field data from ${formatWhen(refData.fetchedAt)}` : "No field data on this device yet"}
          {refError ? ` · ${refError}` : ""}
        </span>
        <button type="button" className="fa-link" onClick={() => refresh()} disabled={refLoading || !online}>
          <RefreshCw size={16} className={refLoading ? "fa-spin" : ""} /> {refLoading ? "Updating…" : "Update"}
        </button>
      </div>
    </div>
  );
}
