/** Touch-first building blocks for the field app (large targets, minimal typing). */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleDashed,
  CloudOff,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  X,
} from "lucide-react";
import { blobGet } from "./fieldDb.js";

export function cx(...names) {
  return names.filter(Boolean).join(" ");
}

export function Screen({ title, subtitle, onBack, children, footer, wide = false }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [title]);
  return (
    <div className={cx("fa-screen", wide && "fa-screen-wide")}>
      <div className="fa-screen-head">
        {onBack ? (
          <button type="button" className="fa-icon-btn" onClick={onBack} aria-label="Back">
            <ChevronLeft size={26} />
          </button>
        ) : null}
        <div className="fa-screen-titles">
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      <div className="fa-screen-body">{children}</div>
      {footer ? <div className="fa-footer"><div className="fa-footer-inner">{footer}</div></div> : null}
    </div>
  );
}

export function Section({ title, hint, children, aside }) {
  return (
    <section className="fa-section">
      {title ? (
        <div className="fa-section-head">
          <h2>{title}</h2>
          {aside}
        </div>
      ) : null}
      {hint ? <p className="fa-hint">{hint}</p> : null}
      {children}
    </section>
  );
}

export function Field({ label, required, error, hint, children, id }) {
  return (
    <div className={cx("fa-field", error && "fa-field-error")} data-error={error ? "1" : undefined} id={id}>
      {label ? (
        <div className="fa-label">
          {label}
          {required ? <span className="fa-req" aria-label="required">Required</span> : null}
        </div>
      ) : null}
      {children}
      {error ? <div className="fa-error-text" role="alert"><AlertTriangle size={16} /> {error}</div> : hint ? <div className="fa-hint">{hint}</div> : null}
    </div>
  );
}

/** Big one-tap choice buttons. options: [{ value, label, tone? }] */
export function Segmented({ value, options, onChange, ariaLabel, columns }) {
  return (
    <div className="fa-seg" role="radiogroup" aria-label={ariaLabel} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
      {options.map((option) => {
        const item = typeof option === "string" ? { value: option, label: option } : option;
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={cx("fa-seg-btn", active && "is-active", active && item.tone && `tone-${item.tone}`)}
            onClick={() => onChange(active && item.clearable ? "" : item.value)}
          >
            {active ? <Check size={18} aria-hidden="true" /> : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Multi-select chips. */
export function Chips({ values = [], options, onChange, ariaLabel }) {
  const set = new Set(values);
  return (
    <div className="fa-chips" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const item = typeof option === "string" ? { value: option, label: option } : option;
        const active = set.has(item.value);
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            className={cx("fa-chip", active && "is-active")}
            onClick={() => {
              const next = new Set(set);
              if (active) next.delete(item.value);
              else next.add(item.value);
              onChange([...next]);
            }}
          >
            {active ? <Check size={16} aria-hidden="true" /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function PickerButton({ value, placeholder = "Tap to choose", onClick, error, icon }) {
  return (
    <button type="button" className={cx("fa-picker-btn", !value && "is-empty", error && "is-error")} onClick={onClick}>
      {icon}
      <span className="fa-picker-value">{value || placeholder}</span>
      <ChevronDown size={22} aria-hidden="true" />
    </button>
  );
}

/**
 * Full-height chooser with search and recent picks.
 * options: [{ value, label, detail?, keywords? }]
 */
export function PickerSheet({ open, title, options = [], recent = [], onPick, onClose, allowCustom = false, customLabel = "Use", searchPlaceholder = "Search", multiple = false, selected = [] }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const [chosen, setChosen] = useState(selected);
  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setChosen(selected);
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("fa-noscroll");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("fa-noscroll");
    };
  }, [open]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 300);
    return options.filter((option) => `${option.label} ${option.detail || ""} ${option.keywords || ""}`.toLowerCase().includes(q)).slice(0, 300);
  }, [options, query]);
  const recentOptions = useMemo(() => {
    if (query.trim() || !recent.length) return [];
    return recent.map((value) => options.find((option) => option.value === value) || (allowCustom ? { value, label: value } : null)).filter(Boolean);
  }, [recent, options, query, allowCustom]);
  if (!open) return null;
  const chosenSet = new Set(chosen);
  const pick = (option) => {
    if (!multiple) {
      onPick(option.value, option);
      return;
    }
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(option.value)) next.delete(option.value);
      else next.add(option.value);
      return [...next];
    });
  };
  const row = (option, keyPrefix = "") => {
    const active = multiple ? chosenSet.has(option.value) : selected.includes(option.value);
    return (
      <button key={`${keyPrefix}${option.value}`} type="button" className={cx("fa-sheet-row", active && "is-active")} onClick={() => pick(option)}>
        <span className="fa-sheet-row-text">
          <strong>{option.label}</strong>
          {option.detail ? <small>{option.detail}</small> : null}
        </span>
        {active ? <CheckCircle2 size={24} aria-hidden="true" /> : null}
      </button>
    );
  };
  const trimmed = query.trim();
  const exact = options.some((option) => option.label.toLowerCase() === trimmed.toLowerCase());
  return (
    <div className="fa-sheet-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="fa-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="fa-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="fa-icon-btn" onClick={onClose} aria-label="Close"><X size={26} /></button>
        </div>
        {options.length > 6 || allowCustom ? (
          <label className="fa-search">
            <Search size={20} aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              enterKeyHint="search"
              autoComplete="off"
            />
            {query ? <button type="button" className="fa-icon-btn sm" onClick={() => setQuery("")} aria-label="Clear search"><X size={18} /></button> : null}
          </label>
        ) : null}
        <div className="fa-sheet-list">
          {allowCustom && trimmed && !exact ? (
            <button type="button" className="fa-sheet-row is-custom" onClick={() => pick({ value: trimmed, label: trimmed })}>
              <span className="fa-sheet-row-text"><strong>{customLabel} “{trimmed}”</strong></span>
              <Plus size={22} />
            </button>
          ) : null}
          {recentOptions.length ? (
            <>
              <div className="fa-sheet-group">Recent</div>
              {recentOptions.map((option) => row(option, "r-"))}
              <div className="fa-sheet-group">All</div>
            </>
          ) : null}
          {filtered.map((option) => row(option))}
          {!filtered.length && !(allowCustom && trimmed) ? <p className="fa-empty">Nothing matches “{query}”.</p> : null}
        </div>
        {multiple ? (
          <div className="fa-sheet-foot">
            <button type="button" className="fa-btn fa-btn-primary fa-btn-block" onClick={() => onPick(chosen)}>
              Done{chosen.length ? ` · ${chosen.length} selected` : ""}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 999, ariaLabel }) {
  const number = Number(value) || 0;
  return (
    <div className="fa-stepper" aria-label={ariaLabel}>
      <button type="button" className="fa-icon-btn lg" onClick={() => onChange(String(Math.max(min, number - 1)))} aria-label="Decrease"><Minus size={24} /></button>
      <input inputMode="numeric" pattern="[0-9]*" value={value ?? ""} onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))} aria-label={ariaLabel} />
      <button type="button" className="fa-icon-btn lg" onClick={() => onChange(String(Math.min(max, number + 1)))} aria-label="Increase"><Plus size={24} /></button>
    </div>
  );
}

export function TextArea({ value, onChange, placeholder, rows = 3, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 480)}px`;
  }, [value]);
  return <textarea ref={ref} className="fa-input fa-textarea" rows={rows} value={value || ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} {...rest} />;
}

export function TextInput({ value, onChange, ...rest }) {
  return <input className="fa-input" value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...rest} />;
}

function Thumb({ attachment, onRemove }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    blobGet(attachment.id).then((entry) => {
      if (!active) return;
      if (entry?.blob) {
        objectUrl = URL.createObjectURL(entry.blob);
        setUrl(objectUrl);
      } else if (attachment.uploaded?.downloadUrl) {
        setUrl(attachment.uploaded.downloadUrl);
      }
    }).catch(() => null);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);
  return (
    <div className="fa-thumb">
      {url ? <img src={url} alt={attachment.name} /> : <CircleDashed size={22} />}
      {onRemove ? <button type="button" className="fa-thumb-x" onClick={onRemove} aria-label="Remove photo"><X size={16} /></button> : null}
    </div>
  );
}

export function PhotoStrip({ attachments = [], onAdd, onRemove, max = 6 }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fa-photos">
      {attachments.map((attachment) => (
        <Thumb key={attachment.id} attachment={attachment} onRemove={onRemove ? () => onRemove(attachment.id) : null} />
      ))}
      {attachments.length < max && onAdd ? (
        <button type="button" className="fa-photo-add" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 size={24} className="fa-spin" /> : <Camera size={26} />}
          <span>{attachments.length ? "Add photo" : "Take photo"}</span>
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            await onAdd(file);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

const STATUS_META = {
  draft: { label: "Not finished", icon: CircleDashed, tone: "muted" },
  queued: { label: "Saved on device", icon: Smartphone, tone: "info" },
  syncing: { label: "Sending…", icon: RefreshCw, tone: "info", spin: true },
  synced: { label: "Synced", icon: CheckCircle2, tone: "ok" },
  attention: { label: "Needs attention", icon: AlertTriangle, tone: "warn" },
  offline: { label: "Offline", icon: CloudOff, tone: "muted" },
};

export function StatusChip({ status, label }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  const Icon = meta.icon;
  return (
    <span className={cx("fa-status", `tone-${meta.tone}`)}>
      <Icon size={15} className={meta.spin ? "fa-spin" : ""} aria-hidden="true" />
      {label || meta.label}
    </span>
  );
}

export function Banner({ tone = "info", icon, title, children, action }) {
  return (
    <div className={cx("fa-banner", `tone-${tone}`)} role={tone === "warn" ? "alert" : "status"}>
      {icon ? <span className="fa-banner-icon">{icon}</span> : null}
      <div className="fa-banner-text">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Confirm({ open, title, body, confirmLabel = "Confirm", tone = "danger", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fa-sheet-backdrop is-center" role="alertdialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="fa-dialog" onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        {body ? <p>{body}</p> : null}
        <div className="fa-dialog-actions">
          <button type="button" className="fa-btn fa-btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className={cx("fa-btn", tone === "danger" ? "fa-btn-danger" : "fa-btn-primary")} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/** Scroll to and focus the first field with an error. */
export function focusFirstError() {
  window.requestAnimationFrame(() => {
    const el = document.querySelector("[data-error='1']");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = el.querySelector("input, textarea, button");
    focusable?.focus({ preventScroll: true });
  });
}

export function ErrorSummary({ errors }) {
  const count = Object.keys(errors || {}).length;
  if (!count) return null;
  return (
    <button type="button" className="fa-error-summary" onClick={focusFirstError}>
      <AlertTriangle size={20} /> {count === 1 ? "1 item needs fixing" : `${count} items need fixing`} — show me
    </button>
  );
}

export function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today ${time}`;
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

export function formatDay(day) {
  if (!day) return "";
  const [y, m, d] = String(day).split("-").map(Number);
  if (!y || !m || !d) return String(day);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
