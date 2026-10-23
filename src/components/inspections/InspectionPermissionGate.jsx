import { ShieldAlert } from "lucide-react";

export default function InspectionPermissionGate({
  allowed = false,
  loading = false,
  title = "Access denied",
  description = "You do not have permission to view this inspections area.",
  children,
} = {}) {
  if (loading) {
    return (
      <div className="inspections-loading-state" role="status">
        <p>Loading inspections module...</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="inspections-denied-state" role="alert">
        <ShieldAlert size={22} aria-hidden />
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    );
  }

  return children;
}
