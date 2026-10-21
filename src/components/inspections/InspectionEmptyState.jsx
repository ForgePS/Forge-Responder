import { ClipboardCheck } from "lucide-react";

export default function InspectionEmptyState({
  title = "No inspections yet",
  description = "Inspection records will appear here once they are created for this department.",
  icon: Icon = ClipboardCheck,
} = {}) {
  return (
    <div className="inspections-empty-state" role="status">
      <Icon size={28} aria-hidden />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
