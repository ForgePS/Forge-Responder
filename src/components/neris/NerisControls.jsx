import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

/** Labelled field wrapper. */
export function Field({ label, help, required = false, wide = false, missing = false, children, id }) {
  return (
    <div className={`nr-field${wide ? " nr-wide" : ""}${missing ? " nr-missing" : ""}`} id={id}>
      <span className="nr-label">
        {label}
        {required ? <em className="nr-req" aria-label="required">Required</em> : null}
      </span>
      {children}
      {help ? <small className="nr-help">{help}</small> : null}
    </div>
  );
}

/** A titled card that groups fields. */
export function Section({ title, icon: Icon, description, action, children, tone }) {
  return (
    <section className={`nr-section${tone ? ` nr-section-${tone}` : ""}`}>
      <header>
        <div className="nr-section-title">
          {Icon ? <span className="nr-section-icon"><Icon size={16} /></span> : null}
          <div>
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
        </div>
        {action}
      </header>
      <div className="nr-grid">{children}</div>
    </section>
  );
}

export function TextInput({ value, onChange, disabled, placeholder, type = "text", ...rest }) {
  return (
    <input
      className="nr-input"
      type={type}
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      {...rest}
    />
  );
}

export function TextArea({ value, onChange, disabled, rows = 3, placeholder }) {
  return (
    <textarea
      className="nr-input nr-textarea"
      rows={rows}
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** Yes / No (stores "True" / "False", NERIS style). */
export function YesNo({ value, onChange, disabled }) {
  return (
    <div className="nr-segmented" role="radiogroup">
      {[["True", "Yes"], ["False", "No"]].map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={value === v ? "active" : ""}
          disabled={disabled}
          onClick={() => onChange(value === v ? "" : v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Searchable picker. `multiple` stores an array; otherwise a single value.
 * Values not in `options` (from older reports) still show and can be removed.
 */
export function Picker({ value, onChange, options = [], multiple = false, disabled = false, placeholder = "Choose…", groupBy }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const selected = useMemo(() => {
    if (multiple) return Array.isArray(value) ? value.flat().filter(Boolean) : value ? [value] : [];
    return value ? [Array.isArray(value) ? value[0] : value] : [];
  }, [value, multiple]);
  const labelFor = (v) => options.find((o) => o.value === v)?.label || String(v);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = term ? options.filter((o) => `${o.label} ${o.value}`.toLowerCase().includes(term)) : options;
    return list.slice(0, 300);
  }, [options, query]);

  const grouped = useMemo(() => {
    if (!groupBy) return [["", filtered]];
    const map = new Map();
    for (const o of filtered) {
      const key = groupBy(o);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(o);
    }
    return [...map.entries()];
  }, [filtered, groupBy]);

  function choose(v) {
    if (multiple) {
      onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
      setQuery("");
    } else {
      onChange(v);
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className={`nr-picker${open ? " open" : ""}${disabled ? " disabled" : ""}`} ref={rootRef}>
      <button type="button" className="nr-input nr-picker-trigger" disabled={disabled} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        {multiple ? (
          selected.length ? (
            <span className="nr-chips">
              {selected.map((v, index) => (
                <span key={v} className="nr-chip">
                  {index === 0 && multiple && groupBy ? <b>Primary · </b> : null}
                  {labelFor(v)}
                  {!disabled ? (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove ${labelFor(v)}`}
                      onClick={(event) => { event.stopPropagation(); onChange(selected.filter((x) => x !== v)); }}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.stopPropagation(); onChange(selected.filter((x) => x !== v)); } }}
                    >
                      <X size={12} />
                    </span>
                  ) : null}
                </span>
              ))}
            </span>
          ) : <span className="nr-placeholder">{placeholder}</span>
        ) : (
          <span className={selected.length ? "" : "nr-placeholder"}>{selected.length ? labelFor(selected[0]) : placeholder}</span>
        )}
        <ChevronDown size={16} className="nr-picker-caret" />
      </button>
      {open ? (
        <div className="nr-picker-menu" role="listbox" aria-multiselectable={multiple}>
          <label className="nr-picker-search">
            <Search size={14} />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type to search…" />
          </label>
          <div className="nr-picker-list">
            {grouped.map(([group, list]) => (
              <div key={group || "all"}>
                {group ? <div className="nr-picker-group">{group}</div> : null}
                {list.map((o) => {
                  const isOn = selected.includes(o.value);
                  return (
                    <button type="button" key={o.value} role="option" aria-selected={isOn} className={isOn ? "on" : ""} onClick={() => choose(o.value)}>
                      <span>{groupBy ? o.label.split(" — ").slice(1).join(" — ") || o.label : o.label}</span>
                      {isOn ? <Check size={14} /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
            {!filtered.length ? <p className="nr-picker-empty">No matches</p> : null}
          </div>
          {!multiple && selected.length ? (
            <button type="button" className="nr-picker-clear" onClick={() => { onChange(""); setOpen(false); }}>Clear</button>
          ) : null}
          {multiple ? (
            <button type="button" className="nr-picker-done" onClick={() => setOpen(false)}>Done</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Progress ring (0–100). */
export function ProgressRing({ percent = 0, size = 44, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <svg className="nr-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${p}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="nr-ring-track" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        className={`nr-ring-fill${p === 100 ? " complete" : ""}`}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c - (p / 100) * c}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{p}%</text>
    </svg>
  );
}
