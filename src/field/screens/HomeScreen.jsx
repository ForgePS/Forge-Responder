import { useMemo } from "react";
import {
  AlertTriangle,
  BookOpen,
  Building,
  ChevronRight,
  ClipboardList,
  PackageOpen,
  Stethoscope,
  ClipboardCheck,
  Droplets,
  FileWarning,
  Flame,
  RefreshCw,
  Siren,
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

function Tile({ icon, title, detail, onClick, tone }) {
  return (
    <button type="button" className={`fa-tile tone-${tone}`} onClick={onClick}>
      <span className="fa-tile-icon">{icon}</span>
      <span className="fa-tile-text">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      <ChevronRight size={22} className="fa-tile-chev" aria-hidden="true" />
    </button>
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
  const todaysLogs = refItems(refData, "dailyLogs").filter((log) => log.date === today);
  const checkoffLists = refItems(refData, "checkoffLists");
  const emsLists = checkoffLists.filter((list) => list.kind === "ems");
  const supplyLists = checkoffLists.filter((list) => list.kind === "supply");
  const doneToday = (kind) => new Set(records
    .filter((record) => record.kind === "checkoff" && record.status !== "draft" && record.data?.list?.kind === kind && record.data?.completedAt && localDate(new Date(record.data.completedAt)) === today)
    .map((record) => record.data.listId)).size;
  const assignedInspections = refItems(refData, "inspections");
  const planCount = refItems(refData, "preplans").length + refItems(refData, "legacyPlans").length;
  const noData = !refData.fetchedAt;

  const tiles = [
    caps.truckChecks && {
      key: "truck",
      icon: <ClipboardCheck size={30} />,
      title: "Truck check",
      detail: assets.length ? `${checkedToday.size} of ${assets.length} units checked today` : "Daily apparatus check",
      onClick: () => navigate("truckCheck"),
      tone: "red",
    },
    caps.emsCheckoff && emsLists.length > 0 && {
      key: "ems",
      icon: <Stethoscope size={30} />,
      title: "EMS unit check-off",
      detail: `${doneToday("ems")} of ${emsLists.length} done today`,
      onClick: () => navigate("checkoffs", { kind: "ems" }),
      tone: "red",
    },
    caps.supplyCheckoff && supplyLists.length > 0 && {
      key: "supply",
      icon: <PackageOpen size={30} />,
      title: "Supply closet check-off",
      detail: `${supplyLists.length} list${supplyLists.length === 1 ? "" : "s"} · counts and expirations`,
      onClick: () => navigate("checkoffs", { kind: "supply" }),
      tone: "teal",
    },
    caps.inspections && {
      key: "inspections",
      icon: <ClipboardList size={30} />,
      title: "Inspections",
      detail: assignedInspections.length ? `${assignedInspections.length} assigned to you` : "None assigned right now",
      onClick: () => navigate("inspections"),
      tone: "violet",
    },
    caps.preFirePlans && {
      key: "plans",
      icon: <Building size={30} />,
      title: "Pre-fire plans",
      detail: planCount ? `${planCount} plans on this device` : "Find a plan by address or nearest",
      onClick: () => navigate("plans"),
      tone: "amber",
    },
    (caps.hydrants || caps.hydrantDamage) && {
      key: "hydrants",
      icon: <Droplets size={30} />,
      title: "Hydrants",
      detail: caps.hydrants ? "Inspect · Flow test · Report damage" : "Report hydrant damage",
      onClick: () => navigate("hydrants"),
      tone: "blue",
    },
    caps.hoseTests && {
      key: "hose",
      icon: <Waves size={30} />,
      title: "Hose testing",
      detail: `${hoseThisYear} tested in ${new Date().getFullYear()}`,
      onClick: () => navigate("hoseTest"),
      tone: "teal",
    },
    caps.damageForm && {
      key: "damage",
      icon: <FileWarning size={30} />,
      title: "Damage form",
      detail: "Damaged property or equipment",
      onClick: () => navigate("damageForm"),
      tone: "amber",
    },
    caps.dailyLogView && {
      key: "log",
      icon: <BookOpen size={30} />,
      title: "Daily log",
      detail: todaysLogs.length ? `${todaysLogs.length} log${todaysLogs.length === 1 ? "" : "s"} today` : "Crew and shift notes",
      onClick: () => navigate("dailyLog"),
      tone: "violet",
    },
    caps.incidents && {
      key: "incident",
      icon: <Siren size={30} />,
      title: "Incident report",
      detail: "Start a NERIS report from the scene",
      onClick: () => navigate("incidents"),
      tone: "slate",
    },
  ].filter(Boolean);

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

      <div className="fa-tiles">
        {tiles.map((tile) => <Tile key={tile.key} {...tile} />)}
      </div>
      {!tiles.length ? (
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
