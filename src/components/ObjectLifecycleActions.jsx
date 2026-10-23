import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { isObjectArchived, isObjectDeleted } from "../lib/objectLifecycle.js";

/**
 * Academy-style secondary actions for uploaded objects:
 * Archive ≈ Disable, Delete ≈ Disconnect, Restore for archived rows.
 */
export default function ObjectLifecycleActions({
  record,
  canEdit = false,
  busy = false,
  onArchive,
  onRestore,
  onDelete,
  compact = false,
  className = "",
}) {
  if (!canEdit || !record || isObjectDeleted(record)) return null;

  const archived = isObjectArchived(record);
  const btnClass = compact ? "row-action" : "secondary-button";

  return (
    <div className={`object-lifecycle-actions ${className}`.trim()}>
      {archived ? (
        <button
          type="button"
          className={btnClass}
          disabled={busy}
          onClick={onRestore}
          title="Restore from archive"
        >
          <RotateCcw size={14} />
          {!compact ? " Restore" : null}
        </button>
      ) : (
        <button
          type="button"
          className={btnClass}
          disabled={busy}
          onClick={onArchive}
          title="Archive"
        >
          <Archive size={14} />
          {!compact ? " Archive" : null}
        </button>
      )}
      <button
        type="button"
        className={`${btnClass} danger-button`}
        disabled={busy}
        onClick={onDelete}
        title="Delete"
      >
        <Trash2 size={14} />
        {!compact ? " Delete" : null}
      </button>
    </div>
  );
}
