import {
  Award,
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Contact,
  FileUser,
  Paperclip,
  Syringe,
  TrendingUp,
  GraduationCap,
} from "lucide-react";

export const PERSONNEL_SECTIONS = [
  { id: "personalDetails", label: "Personal Details", icon: ClipboardList },
  { id: "emergencyContact", label: "Emergency Contact", icon: Contact },
  { id: "certifications", label: "Certifications", icon: Award },
  { id: "trainingEvents", label: "Training & Events", icon: CalendarCheck },
  { id: "academy", label: "Academy", icon: GraduationCap },
  { id: "accruals", label: "Accruals", icon: BarChart3 },
  { id: "activityLog", label: "Leave & Shift History", icon: CalendarDays },
  { id: "payRates", label: "Pay Rates", icon: CircleDollarSign },
  { id: "promotions", label: "Promotions", icon: TrendingUp },
  { id: "attachments", label: "Attachments", icon: Paperclip },
  { id: "immunization", label: "Immunization", icon: Syringe },
  { id: "employmentHistory", label: "Employment History", icon: Building2 },
  { id: "consultation", label: "Consultation", icon: FileUser },
];

export function getPersonnelSection(id) {
  return PERSONNEL_SECTIONS.find((section) => section.id === id) || PERSONNEL_SECTIONS[0];
}
