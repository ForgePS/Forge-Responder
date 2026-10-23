import { useEffect, useRef, useState } from "react";
import { cellToString } from "../lib/adminCellUtils.js";

export default function AdminTextInput({
  value,
  disabled = false,
  type = "text",
  onChange,
  onKeyDown,
}) {
  const [draft, setDraft] = useState(() => cellToString(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(cellToString(value));
    }
  }, [value]);

  function handleChange(nextValue) {
    setDraft(nextValue);
    onChange(nextValue);
  }

  return (
    <input
      type={type}
      value={draft}
      disabled={disabled}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        setDraft(cellToString(value));
      }}
      onChange={(event) => handleChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
