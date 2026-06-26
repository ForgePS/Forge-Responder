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
  Home,
  Mail,
  Truck,
  UserRound,
  UserPlus,
  Wrench,
} from "lucide-react";

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
