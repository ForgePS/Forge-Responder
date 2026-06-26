import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, List, Search, Star } from "lucide-react";
import {
  getFavoriteValues,
  recordRecentValue,
  sortPicklistOptions,
  toggleFavoriteValue,
} from "../../lib/neris/picklists.js";

/**
 * @param {{
 *   picklistId?: string,
 *   value?: string,
 *   options?: Array<{ value: string, label?: string }>,
 *   onChange: (value: string) => void,
 *   disabled?: boolean,
 *   placeholder?: string,
 *   allowFavorite?: boolean,
 * }} props
 */
export default function NerisSearchableSelect({
  picklistId = "default",
  value = "",
  options = [],
  onChange,
  disabled = false,
  placeholder = "Select…",
  allowFavorite = true,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(() => getFavoriteValues(picklistId));
  const rootRef = useRef(null);

  const sorted = useMemo(
    () => sortPicklistOptions(options, picklistId),
    [options, picklistId, favorites],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter((opt) =>
      (opt.label || opt.value).toLowerCase().includes(term)
      || opt.value.toLowerCase().includes(term));
  }, [sorted, query]);

  const selectedLabel = options.find((o) => o.value === value)?.label || value;

  useEffect(() => {
    function handleClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectOption(opt) {
    onChange(opt.value);
    recordRecentValue(picklistId, opt.value);
    setOpen(false);
    setQuery("");
  }

  function toggleFavorite(event, optValue) {
    event.stopPropagation();
    setFavorites(toggleFavoriteValue(picklistId, optValue));
  }

  return (
    <div className={`neris-searchable-select ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="neris-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value ? "" : "placeholder"}>{selectedLabel || placeholder}</span>
        <List size={14} className="neris-select-list-icon" />
      </button>
      {open ? (
        <div className="neris-select-dropdown" role="listbox">
          <label className="neris-select-search">
            <Search size={13} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search…"
              autoFocus
            />
          </label>
          <ul>
            {filtered.length ? filtered.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  className={opt.value === value ? "selected" : ""}
                  onClick={() => selectOption(opt)}
                >
                  <span>{opt.label || opt.value}</span>
                  {allowFavorite ? (
                    <button
                      type="button"
                      className={`neris-favorite-btn ${favorites.includes(opt.value) ? "active" : ""}`}
                      onClick={(e) => toggleFavorite(e, opt.value)}
                      aria-label="Toggle favorite"
                    >
                      <Star size={12} />
                    </button>
                  ) : null}
                </button>
              </li>
            )) : (
              <li className="neris-select-empty">No matches</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
