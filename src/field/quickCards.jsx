/**
 * FORGE Field quick cards: the categories on the home screen and the tools in
 * each one. Daily log, incident reports and supply check-offs stay in the RMS.
 * A tool the person's role can't use is left out; "soon" marks tools not built
 * yet; "href" opens an outside site.
 */
import { useMemo } from "react";
import {
  Biohazard,
  BookOpen,
  BookMarked,
  Building,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  FileSearch,
  FileWarning,
  Flame,
  Phone,
  Pill,
  Stethoscope,
  Syringe,
  Waves,
} from "lucide-react";
import { useField } from "./fieldContext.jsx";
import { refItems } from "./fieldRefData.js";
import { localDate } from "./fieldValidation.js";
import { rmsPathFromFieldPath } from "./fieldPaths.js";

const PILL_IDENTIFIER_URL = "https://www.drugs.com/imprints.php";

export function useQuickCards() {
  const { caps, refData, records, navigate, online } = useField();
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
  const checkoffLists = refItems(refData, "checkoffLists");
  const emsLists = checkoffLists.filter((list) => list.kind === "ems");
  const doneToday = (kind) => new Set(records
    .filter((record) => record.kind === "checkoff" && record.status !== "draft" && record.data?.list?.kind === kind && record.data?.completedAt && localDate(new Date(record.data.completedAt)) === today)
    .map((record) => record.data.listId)).size;
  const assignedInspections = refItems(refData, "inspections");
  const planCount = refItems(refData, "preplans").length + refItems(refData, "legacyPlans").length;

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
        caps.preFirePlans && {
          key: "inspection-plans",
          icon: <Building size={24} />,
          title: "Pre-plans",
          detail: planCount ? `${planCount} plans on this device` : "Find a plan by address or nearest",
          onClick: () => navigate("plans"),
        },
        caps.fireCodes && {
          key: "fire-codes",
          icon: <BookMarked size={24} />,
          title: "Fire codes",
          detail: online ? "Code Library in FORGE Responder · needs signal" : "Needs signal",
          href: `${rmsPathFromFieldPath()}${rmsPathFromFieldPath().includes("?") ? "&" : "?"}page=browse-codes`,
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
  return cards.map((card) => ({ ...card, items: card.items.filter(Boolean) }));
}

/** One line under a category on the home screen. */
export function cardSummary(card) {
  const ready = card.items.filter((item) => !item.soon);
  if (!ready.length) return "Coming soon";
  const soon = card.items.length - ready.length;
  return `${ready.length} tool${ready.length === 1 ? "" : "s"}${soon ? ` · ${soon} coming soon` : ""}`;
}
