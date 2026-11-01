import { useEffect, useState } from "react";
import { ArchiveRestore, ChevronDown, ChevronRight } from "lucide-react";
import { listArchivedPlatformDepartments, restorePlatformDepartment } from "../lib/platformService.js";

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : "—";
}

/**
 * Creator Console: archived departments, collapsed by default, with Restore.
 * Archiving never deletes data, so restoring brings the department back as it was.
 */
export default function ArchivedDepartmentsPanel({ user, onRestored, onMessage, refreshKey = 0 }) {
  const [open, setOpen] = useState(false);
  const [archived, setArchived] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [restoringId, setRestoringId] = useState("");

  async function load() {
    try {
      setArchived(await listArchivedPlatformDepartments());
      setLoadError("");
    } catch (error) {
      console.warn("Could not load archived departments", error);
      setLoadError("Couldn't load archived departments.");
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function handleRestore(department) {
    const name = department.name || department.id;
    if (!window.confirm(`Restore ${name}?\n\nIt will show up in the department list again and its people can sign in again.`)) return;
    setRestoringId(department.id);
    try {
      await restorePlatformDepartment(department.id, user);
      onMessage?.(`${name} was restored.`);
      await load();
      await onRestored?.(department.id);
    } catch (error) {
      console.error("Failed to restore department", error);
      onMessage?.(
        error?.code === "permission-denied"
          ? `You don't have permission to restore ${name}. Sign in with two-factor as a platform creator and try again.`
          : `Couldn't restore ${name}: ${error?.message || "unknown error"}`
      );
    } finally {
      setRestoringId("");
    }
  }

  return (
    <section className="archived-departments">
      <button
        className="secondary-button"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Archived departments ({archived.length})
      </button>

      {open && (
        <>
          {loadError && <p className="auth-help">{loadError}</p>}
          {!loadError && !archived.length && <p className="auth-help">No archived departments.</p>}
          {archived.length > 0 && (
            <div className="cert-table department-subscription-table">
              <div className="cert-row cert-head">
                <span>Department</span>
                <span>ID</span>
                <span>Archived</span>
                <span />
              </div>
              {archived.map((department) => (
                <div className="cert-row" key={department.id}>
                  <strong>{department.name || department.id}</strong>
                  <span>{department.id}</span>
                  <span>{formatDate(department.archivedAt)}</span>
                  <button
                    className="row-action"
                    type="button"
                    onClick={() => handleRestore(department)}
                    disabled={Boolean(restoringId)}
                  >
                    <ArchiveRestore size={12} /> {restoringId === department.id ? "Restoring..." : "Restore"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
