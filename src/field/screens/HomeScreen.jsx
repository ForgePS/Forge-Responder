import { useMemo } from "react";
import {
  AlertTriangle,
  Biohazard,
  BookOpen,
  Building,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  ExternalLink,
  FileSearch,
  FileWarning,
  Flame,
  Phone,
  Pill,
  RefreshCw,
  Stethoscope,
  Syringe,
  Waves,
  WifiOff,
} from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { FORM_FOR_KIND } from "../fieldKinds.js";
import { refItems } from "../fieldRefData.js";
import { localDate } from "../fieldValidation.js";
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

const PILL_IDENTIFIER_URL = "https://www.drugs.com/imprints.php";

/** One tool inside a quick card: opens a screen, an outside site, or is "Coming soon". */
function CardItem({ icon, title, detail, onClick, href, soon = false }) {
  const body = (
    <>
      <span className="fa-qc-item-icon">{icon}</span>
      <span className="fa-qc-item-text">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {soon
        ? <span className="fa-qc-soon">Coming soon</span>
        : href ? <ExternalLink size={18} className="fa-qc-chev" aria-hidden="true" /> : <ChevronRight size={20} className="fa-qc-chev" aria-hidden="true" />}
    </>
  );
  if (soon) return <div className="fa-qc-item is-soon" aria-disabled="true">{body}</div>;
  if (href) return <a className="fa-qc-item" href={href} target="_blank" rel="noreferrer">{body}</a>;
  return <button type="button" className="fa-qc-item" onClick={onClick}>{body}</button>;
}

/** A quick card: a heading and the tools under it. Cards with nothing to show are left out. */
function QuickCard({ icon, title, tone, items }) {
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return (
    <section className={`fa-qc tone-${tone}`} aria-label={title}>
      <header className="fa-qc-head">
        <span className="fa-qc-head-icon">{icon}</span>
        <h2>{title}</h2>
      </header>
      <div className="fa-qc-items">
        {shown.map((item) => <CardItem key={item.key} {...item} />)}
      </div>
    </section>
  );
}

export default function HomeScreen() {
  const { snapshot, caps, refData, refLoading, refError, refresh, records, counts, navigate, online } = useField();
  const today = localDate();
  const assets = refItems(refData, "assets");

  const checkedToday = useMemo(() => {
    const ids = new Set();
    assets.forEach((asset) => {
      if (asset.lastCheckAt && localDate(new Date(asset.lastCheckAt)) === today) ids.add(asset.id);
    });
    records.forEach((record) => {
      if (record.kind === "truckCheck" && record.status !== "draft" && record.data?.completedAt && localDate(new Date(record.data.completedAt)) === today) {
        ids.add(record.data.assetId);
      }
    });
    return ids;
  }, [assets, records, today]);

  const hoseThisYear = refItems(refData, "hoseTests").length
    + records.filter((record) => record.kind === "hoseTest" && record.status !== "synced").reduce((sum, record) => sum + (record.data?.hoseIds?.length || 0), 0);
  const drafts = records.filter((record) => record.status === "draft");
  const checkoffLists = refItems(refData, "checkoffLists");
  const emsLists = checkoffLists.filter((list) => list.kind === "ems");
  const doneToday = (kind) => new Set(records
    .filter((record) => record.kind === "checkoff" && record.status !== "draft" && record.data?.list?.kind === kind && record.data?.completedAt && localDate(new Date(record.data.completedAt)) === today)
    .map((record) => record.data.listId)).size;
  const assignedInspections = refItems(refData, "inspections");
  const planCount = refItems(refData, "preplans").length + refItems(refData, "legacyPlans").length;
  const noData = !refData.fetchedAt;

  // Quick cards. Daily log, incident reports and supply check-offs stay in the RMS.
  const cards = [
    {
      key: "fire",
      icon: <Flame size={24} />,
      title: "Fire",
      tone: "red",
      items: [
        caps.truckChecks && {
          key: "truck",
          icon: <ClipboardCheck size={24} />,
          title: "Daily checks",
          detail: assets.length ? `${checkedToday.size} of ${assets.length} units checked today` : "Daily apparatus check",
          onClick: () => navigate("truckCheck"),
        },
        (caps.hydrants || caps.hydrantDamage) && {
          key: "hydrants",
          icon: <Droplets size={24} />,
          title: "Hydrant testing",
          detail: caps.hydrants ? "Inspect · Flow test · Report damage" : "Report hydrant damage",
          onClick: () => navigate("hydrants"),
        },
        caps.hoseTests && {
          key: "hose",
          icon: <Waves size={24} />,
          title: "Hose testing",
          detail: `${hoseThisYear} tested in ${new Date().getFullYear()}`,
          onClick: () => navigate("hoseTest"),
        },
        caps.preFirePlans && {
          key: "plans",
          icon: <Building size={24} />,
          title: "Pre-plans",
          detail: planCount ? `${planCount} plans on this device` : "Find a plan by address or nearest",
          onClick: () => navigate("plans"),
        },
      ],
    },
    {
      key: "ems",
      icon: <Stethoscope size={24} />,
      title: "EMS",
      tone: "blue",
      items: [
        caps.emsCheckoff && emsLists.length > 0 && {
          key: "ems-check",
          icon: <ClipboardCheck size={24} />,
          title: "EMS unit check-off",
          detail: `${doneToday("ems")} of ${emsLists.length} done today`,
          onClick: () => navigate("checkoffs", { kind: "ems" }),
        },
        { key: "protocols", icon: <BookOpen size={24} />, title: "EMS protocols", soon: true },
        { key: "doses", icon: <Syringe size={24} />, title: "Drug dosages", detail: "Adult and pediatric", soon: true },
        {
          key: "pills",
          icon: <Pill size={24} />,
          title: "Pill identifier",
          detail: online ? "Drugs.com · needs signal" : "Needs signal",
          href: PILL_IDENTIFIER_URL,
        },
      ],
    },
    {
      key: "inspection",
      icon: <ClipboardList size={24} />,
      title: "Inspection",
      tone: "violet",
      items: [
        caps.inspections && {
          key: "inspections",
          icon: <ClipboardList size={24} />,
          title: "Inspections",
          detail: assignedInspections.length ? `${assignedInspections.length} assigned to you` : "None assigned right now",
          onClick: () => navigate("inspections"),
        },
      ],
    },
    {
      key: "damage",
      icon: <FileWarning size={24} />,
      title: "Damage form",
      tone: "amber",
      items: [
        caps.damageForm && {
          key: "damage",
          icon: <FileWarning size={24} />,
          title: "Report damage",
          detail: "Damaged property or equipment",
          onClick: () => navigate("damageForm"),
        },
      ],
    },
    {
      key: "investigation",
      icon: <FileSearch size={24} />,
      title: "Investigation",
      tone: "slate",
      items: [{ key: "investigation", icon: <FileSearch size={24} />, title: "Fire investigation", soon: true }],
    },
    {
      key: "contacts",
      icon: <Phone size={24} />,
      title: "Important contacts",
      tone: "teal",
      items: [{ key: "contacts", icon: <Phone size={24} />, title: "Contacts", detail: "Utilities, mutual aid, hospitals", soon: true }],
    },
    {
      key: "hazmat",
      icon: <Biohazard size={24} />,
      title: "HazMat",
      tone: "amber",
      items: [{ key: "hazmat", icon: <Biohazard size={24} />, title: "HazMat references", detail: "ERG · CAMEO Chemicals · NIOSH", soon: true }],
    },
  ];
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

      <div className="fa-quick-cards">
        {cards.map((card) => <QuickCard key={card.key} {...card} />)}
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
