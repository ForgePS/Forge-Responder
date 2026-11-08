import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toggleValue } from "../../lib/heatZone/heatZoneFilters.js";

const POP_WIDTH = 260;

/** Fixed position under the button, kept inside the viewport (escapes overflow:hidden parents). */
function popoverPosition(button) {
  const rect = button.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - POP_WIDTH - 8));
  const below = window.innerHeight - rect.bottom;
  return below < 260 && rect.top > below
    ? { left, bottom: window.innerHeight - rect.top + 4, maxHeight: Math.min(340, rect.top - 12) }
    : { left, top: rect.bottom + 4, maxHeight: Math.min(340, below - 12) };
}

/**
 * Compact popover checkbox list. `options` = [{ value, label }].
 * Closes on outside click, Escape, scroll or resize.
 */
export default function MultiSelect({ label, options = [], value = [], onChange, disabled = false, emptyText = "No values in this range" }) {
  const [position, setPosition] = useState(null);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listId = useId();
  const open = Boolean(position);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setPosition(null);
    const onDown = (event) => { if (!rootRef.current?.contains(event.target)) close(); };
    const onKey = (event) => { if (event.key === "Escape") { close(); buttonRef.current?.focus(); } };
    const onScroll = (event) => { if (!rootRef.current?.contains(event.target)) close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const selectedLabels = options.filter((o) => value.includes(o.value)).map((o) => o.label);
  const summary = value.length === 1 && selectedLabels[0] ? selectedLabels[0] : value.length ? `${value.length} selected` : "All";
  const isDisabled = disabled || !options.length;

  return (
    <div className={`hz-ms${value.length ? " has-value" : ""}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="hz-ms-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={isDisabled}
        title={!options.length ? emptyText : selectedLabels.join(", ") || `All ${label.toLowerCase()}`}
        onClick={() => setPosition(open ? null : popoverPosition(buttonRef.current))}
      >
        <span className="hz-ms-label">{label}</span>
        <span className="hz-ms-value">{summary}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="hz-ms-pop" id={listId} role="group" aria-label={label} style={{ ...position, width: POP_WIDTH }}>
          {options.length > 8 && (
            <input type="search" className="hz-ms-search" placeholder={`Search ${label.toLowerCase()}`} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          )}
          <div className="hz-ms-actions">
            <button type="button" className="text-button" onClick={() => onChange(options.map((o) => o.value))}>Select all</button>
            <button type="button" className="text-button" disabled={!value.length} onClick={() => onChange([])}>Clear</button>
          </div>
          <div className="hz-ms-list">
            {shown.map((option) => (
              <label key={option.value} className="hz-ms-option">
                <input type="checkbox" checked={value.includes(option.value)} onChange={() => onChange(toggleValue(value, option.value))} />
                <span>{option.label}</span>
              </label>
            ))}
            {!shown.length && <p className="hz-muted">No matches.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
