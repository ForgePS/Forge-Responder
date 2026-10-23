import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Home,
  Mail,
  Truck,
  UserRound,
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
      ["My Certifications", FileCheck2],
      ["My Training", Activity],
      ["My Documents", FileText],
    ],
  },
  {
    label: "Requests",
    items: [
      ["Leave Requests", CalendarDays],
      ["Shift Trades", Activity],
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

export function filterEmployeePortalNav(groups = employeePortalNavGroups, { canViewInternalEmail = true } = {}) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(([name]) => name !== "Messages" || canViewInternalEmail),
    }))
    .filter((group) => group.items.length > 0);
}
