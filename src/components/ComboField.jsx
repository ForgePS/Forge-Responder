import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A dropdown you can also type into: pick from the list, or type a value that
 * isn't on it. Typing filters the list. Keyboard: Down/Up to move, Enter to
 * pick, Escape to close.
 */
export default function ComboField({ value = "", onChange, options = [], placeholder = "", ariaLabel = "", disabled = false }) {
  const listId = useId();
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  // The list is placed on the page itself (fixed), so a dialog's scroll area
  // can't cut it off. It opens upward when there isn't room below.
  const [place, setPlace] = useState(null);
  const LIST_MAX = 220;

  function measure() {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom;
    const up = below < LIST_MAX + 12 && rect.top > below;
    setPlace({
      left: rect.left,
      width: rect.width,
      top: up ? undefined : rect.bottom + 4,
      bottom: up ? window.innerHeight - rect.top + 4 : undefined,
      maxHeight: Math.max(120, Math.min(LIST_MAX, (up ? rect.top : below) - 12)),
    });
  }

  useLayoutEffect(() => {
    if (open) measure();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  const unique = useMemo(() => [...new Set(options.map((option) => String(option || "").trim()).filter(Boolean))], [options]);
  const shown = useMemo(() => {
    const term = String(value || "").trim().toLowerCase();
    if (!filtering || !term) return unique;
    return unique.filter((option) => option.toLowerCase().includes(term));
  }, [unique, value, filtering]);

  function pick(option) {
    onChange(option);
    setOpen(false);
    setFiltering(false);
    setHighlight(-1);
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => Math.min(shown.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" && open && highlight >= 0 && shown[highlight]) {
      event.preventDefault();
      pick(shown[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={`combo-field${open ? " is-open" : ""}`}>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel || undefined}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => { onChange(event.target.value); setFiltering(true); setOpen(true); setHighlight(-1); }}
        onFocus={() => { setFiltering(false); setOpen(true); }}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="combo-field-toggle"
        tabIndex={-1}
        aria-label={open ? "Close list" : "Show list"}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { setFiltering(false); setOpen((current) => !current); inputRef.current?.focus(); }}
      >
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && shown.length ? (
        <ul
          className="combo-field-list"
          id={listId}
          role="listbox"
          style={place ? { position: "fixed", left: place.left, width: place.width, top: place.top, bottom: place.bottom, right: "auto", maxHeight: place.maxHeight } : undefined}
        >
          {shown.map((option, index) => (
            <li
              key={option}
              role="option"
              aria-selected={option === value}
              className={`${index === highlight ? "is-highlighted" : ""}${option === value ? " is-selected" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(option)}
            >
              {option}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
