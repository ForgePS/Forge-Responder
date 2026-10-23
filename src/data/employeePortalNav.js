import {
  Activity,
  BookOpen,
  CalendarDays,
  Check,
  CirclePlus,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  GraduationCap,
  Home,
  Mail,
  Truck,
  UserRound,
  UserPlus,
  Wrench,
} from "lucide-react";
import { FORGE_ACADEMY_CLASS_SCHEDULE_URL } from "../lib/platformUrls.js";

export const employeePortalNavGroups = [
  {
    label: "",
    items: [
      ["My Dashboard", Home],
      ["My Profile", UserRound],
    ],
  },
  {
    label: "Schedule & records",
    items: [
      ["My Schedule", CalendarDays],
      ["Time Card", Clock3],
      ["Daily Log", BookOpen],
      ["My Certifications", FileCheck2],
      ["My Training", Activity],
      ["Academy Class Schedule", GraduationCap, FORGE_ACADEMY_CLASS_SCHEDULE_URL],
      ["My Documents", FileText],
    ],
  },
  {
    label: "Requests",
    items: [
      ["Open Vacancies", UserPlus],
      ["Assigned Tasks", ClipboardCheck],
      ["Apparatus Checks", Truck],
      ["Maintenance Issues", Wrench],
    ],
  },
  {
    label: "Communications",
    items: [
      ["Messages", Mail],
    ],
  },
];

export function filterEmployeePortalNav(
  groups = employeePortalNavGroups,
  { canViewInternalEmail = true, canViewDailyLog = true, isModuleEnabled = () => true } = {}
) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(([name]) => {
        if (name === "Messages" && !canViewInternalEmail) return false;
        if (name === "Daily Log" && (!canViewDailyLog || !isModuleEnabled("dailyLog"))) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
