/**
 * Building blocks for the personnel profile: field groups, phone/email lists,
 * emergency contacts and issued equipment. Each shows values when not editing
 * and inputs when editing.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Star, Trash2, X } from "lucide-react";
import ComboField from "../ComboField.jsx";
import { useDropdowns } from "../../context/DropdownContext.jsx";
import { formatPersonnelDateForDisplay, formatPersonnelDateForInput } from "../../lib/personnelDates.js";
import {
  EMAIL_TYPES, EQUIPMENT_CATEGORIES, EQUIPMENT_STATUSES, PHONE_TYPES, emptyEquipment, equipmentExpiration,
  expiryState, isEquipmentInHand, maskSecret, suggestedRetirement,
} from "../../lib/personnelProfile.js";

const asList = (value) => (Array.isArray(value) ? value : String(value || "").split(/\s*[,;]\s*/)).map((item) => String(item || "").trim()).filter(Boolean);

export function ExpiryBadge({ date, label = "" }) {
  const state = expiryState(date);
  if (!state || state === "ok") return null;
  return <span className={`profile-badge is-${state}`}>{state === "expired" ? "Expired" : "Expiring soon"}{label ? ` · ${label}` : ""}</span>;
}

function SecretValue({ value, ssn }) {
  const [shown, setShown] = useState(false);
  if (!value) return <span className="profile-empty">—</span>;
  return (
    <span className="profile-secret">
      <span>{shown ? value : maskSecret(value, { ssn })}</span>
      <button type="button" className="profile-icon-btn" onClick={() => setShown((on) => !on)} aria-label={shown ? "Hide" : "Show"} title={shown ? "Hide" : "Show"}>
        {shown ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </span>
  );
}

/** Several values (languages, license types): chips, with a dropdown to add. */
function MultiValue({ value, options = [], editing, onChange, label }) {
  const items = asList(value);
  const [adding, setAdding] = useState("");
  if (!editing) {
    return items.length ? <span className="profile-chips">{items.map((item) => <span key={item} className="profile-chip">{item}</span>)}</span> : <span className="profile-empty">—</span>;
  }
  const add = (next) => {
    const clean = String(next || "").trim();
    if (clean && !items.includes(clean)) onChange([...items, clean]);
    setAdding("");
  };
  return (
    <div className="profile-multi">
      <span className="profile-chips">
        {items.map((item) => (
          <span key={item} className="profile-chip">
            {item}
            <button type="button" onClick={() => onChange(items.filter((other) => other !== item))} aria-label={`Remove ${item}`}><X size={12} /></button>
          </span>
        ))}
      </span>
      <div className="profile-multi-add">
        <ComboField value={adding} onChange={(next) => (options.includes(next) ? add(next) : setAdding(next))} options={options.filter((option) => !items.includes(option))} placeholder="Add…" ariaLabel={`Add ${label}`} />
        <button type="button" className="secondary-button" disabled={!adding.trim()} onClick={() => add(adding)}>Add</button>
      </div>
    </div>
  );
}

/**
 * One group of fields as a grid. canEdit(field) decides per field; private
 * fields show "Hidden" when the private record isn't available.
 */
export function FieldGroup({ group, values, editing, onChange, canEdit = () => false, privateReady = true }) {
  const { getOptions } = useDropdowns();
  return (
    <dl className="profile-grid">
      {group.fields.map((field) => {
        const value = values?.[field.key];
        const editable = editing && canEdit(field);
        const hidden = field.private && !privateReady;
        let content;
        if (hidden) content = <span className="profile-empty">Private</span>;
        else if (field.type === "multi") content = <MultiValue value={value} options={field.options} editing={editable} label={field.label} onChange={(next) => onChange(field.key, next)} />;
        else if (editable && field.type === "date") content = <input type="date" value={formatPersonnelDateForInput(value)} onChange={(event) => onChange(field.key, event.target.value)} aria-label={field.label} />;
        else if (editable && field.type === "select") {
          const options = field.dropdown ? getOptions(field.dropdown, value) : field.options || [];
          content = <ComboField value={value || ""} onChange={(next) => onChange(field.key, next)} options={options} ariaLabel={field.label} />;
        } else if (editable) content = <input value={value || ""} onChange={(event) => onChange(field.key, event.target.value)} aria-label={field.label} autoComplete="off" />;
        else if (field.secret) content = <SecretValue value={value} ssn={field.key === "socialSecurityNumber"} />;
        else if (field.type === "date") content = value ? <span>{formatPersonnelDateForDisplay(value)} {field.expires ? <ExpiryBadge date={value} /> : null}</span> : <span className="profile-empty">—</span>;
        else content = value ? <span>{String(value)}</span> : <span className="profile-empty">—</span>;
        return (
          <div key={field.key} className={field.wide ? "is-wide" : ""}>
            <dt>{field.label}{field.private ? <span className="profile-lock" title="Private: only you and personnel administrators see this"> · private</span> : null}</dt>
            <dd>{content}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function moveRow(rows, index, delta) {
  const next = [...rows];
  const [row] = next.splice(index, 1);
  next.splice(Math.max(0, Math.min(next.length, index + delta)), 0, row);
  return next;
}

/** Phone numbers or email addresses, one marked primary. */
export function ContactList({ kind, rows, editing, onChange }) {
  const isPhone = kind === "phone";
  const valueKey = isPhone ? "number" : "address";
  const types = isPhone ? PHONE_TYPES : EMAIL_TYPES;
  if (!editing) {
    if (!rows.length) return <p className="profile-empty">No {isPhone ? "phone numbers" : "email addresses"} on file.</p>;
    return (
      <ul className="profile-contact-list">
        {rows.map((row) => (
          <li key={row.id}>
            {isPhone ? <a href={`tel:${row.number.replace(/[^\d+]/g, "")}`}>{row.number}</a> : <a href={`mailto:${row.address}`}>{row.address}</a>}
            <span className="profile-contact-type">{row.type}</span>
            {row.primary ? <span className="profile-badge is-primary">Primary</span> : null}
            {!isPhone && row.notifications === false ? <span className="profile-badge">No notifications</span> : null}
          </li>
        ))}
      </ul>
    );
  }
  const update = (index, patch) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="profile-rows">
      {rows.map((row, index) => (
        <div key={row.id} className="profile-row-edit">
          <input
            value={row[valueKey]}
            type={isPhone ? "tel" : "email"}
            placeholder={isPhone ? "870-555-0100" : "name@example.com"}
            aria-label={isPhone ? "Phone number" : "Email address"}
            onChange={(event) => update(index, { [valueKey]: event.target.value })}
          />
          <ComboField value={row.type} options={types} onChange={(type) => update(index, { type })} ariaLabel="Type" />
          {!isPhone ? (
            <label className="profile-check"><input type="checkbox" checked={row.notifications !== false} onChange={(event) => update(index, { notifications: event.target.checked })} /> Notifications</label>
          ) : null}
          <button type="button" className={`profile-icon-btn ${row.primary ? "is-on" : ""}`} onClick={() => onChange(rows.map((other, i) => ({ ...other, primary: i === index })))} title="Make primary" aria-label="Make primary"><Star size={15} /></button>
          <button type="button" className="profile-icon-btn" onClick={() => onChange(rows.filter((_, i) => i !== index))} title="Remove" aria-label="Remove"><Trash2 size={15} /></button>
        </div>
      ))}
      <button type="button" className="secondary-button profile-add" onClick={() => onChange([...rows, { id: `${kind}-${Date.now().toString(36)}`, [valueKey]: "", type: types[0], primary: !rows.length, ...(isPhone ? {} : { notifications: true }) }])}>
        <Plus size={14} /> Add {isPhone ? "phone" : "email"}
      </button>
    </div>
  );
}

const EMERGENCY_FIELDS = [
  ["FirstName", "First name"], ["LastName", "Last name"], ["Relationship", "Relationship"], ["Phone", "Phone"],
  ["Address", "Address"], ["City", "City"], ["State", "State"], ["Zip", "Postal code"],
];

/** The two emergency contacts (emergency* and emergency2* fields). */
export function EmergencyContacts({ values, editing, onChange }) {
  const { getOptions } = useDropdowns();
  return (
    <div className="profile-emergency">
      {["emergency", "emergency2"].map((prefix, index) => {
        const has = EMERGENCY_FIELDS.some(([suffix]) => String(values[`${prefix}${suffix}`] || "").trim());
        return (
          <section key={prefix} className="profile-subcard">
            <h4>{index ? "Second contact" : "Primary contact"}</h4>
            {!editing && !has ? <p className="profile-empty">Not set.</p> : editing ? (
              <dl className="profile-grid">
                {EMERGENCY_FIELDS.map(([suffix, label]) => {
                  const key = `${prefix}${suffix}`;
                  return (
                    <div key={key} className={suffix === "Address" ? "is-wide" : ""}>
                      <dt>{label}</dt>
                      <dd>
                        {suffix === "Relationship"
                          ? <ComboField value={values[key] || ""} options={getOptions("emergencyContactRelationships", values[key]).length ? getOptions("emergencyContactRelationships", values[key]) : ["Spouse", "Parent", "Child", "Sibling", "Partner", "Friend", "Other"]} onChange={(next) => onChange(key, next)} ariaLabel={label} />
                          : <input value={values[key] || ""} type={suffix === "Phone" ? "tel" : "text"} onChange={(event) => onChange(key, event.target.value)} aria-label={`${label}, ${index ? "second" : "primary"} contact`} />}
                      </dd>
                    </div>
                  );
                })}
                <div className="is-wide">
                  <label className="profile-check"><input type="checkbox" checked={Boolean(values[`${prefix}SameAddress`])} onChange={(event) => onChange(`${prefix}SameAddress`, event.target.checked)} /> Same address as mine</label>
                </div>
              </dl>
            ) : (
              <div className="profile-emergency-view">
                <strong>{[values[`${prefix}FirstName`], values[`${prefix}LastName`]].filter(Boolean).join(" ") || "—"}</strong>
                {values[`${prefix}Relationship`] ? <span>{values[`${prefix}Relationship`]}</span> : null}
                {values[`${prefix}Phone`] ? <a href={`tel:${String(values[`${prefix}Phone`]).replace(/[^\d+]/g, "")}`}>{values[`${prefix}Phone`]}</a> : null}
                <span className="profile-muted">{values[`${prefix}SameAddress`] ? "Same address" : [values[`${prefix}Address`], values[`${prefix}City`], values[`${prefix}State`], values[`${prefix}Zip`]].filter(Boolean).join(", ")}</span>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

const EQUIPMENT_FIELDS = [
  ["item", "Item", "text"], ["category", "Category", "category"], ["manufacturer", "Manufacturer", "text"],
  ["model", "Model number", "text"], ["serial", "Serial number", "text"], ["size", "Size", "text"],
  ["mfgDate", "Manufacture date", "date"], ["issuedDate", "Issued date", "date"], ["expirationDate", "Expiration", "date"],
  ["status", "Status", "status"], ["notes", "Notes", "wide"],
];

/** Issued equipment: cards with the key facts; editable cards for admins. */
export function IssuedEquipment({ rows, editing, onChange, showReturned = false }) {
  const [showAll, setShowAll] = useState(showReturned);
  const update = (index, patch) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const visible = rows.map((row, index) => ({ row, index })).filter(({ row }) => editing || showAll || isEquipmentInHand(row));
  const hiddenCount = rows.length - visible.length;
  return (
    <div className="profile-equipment">
      {!rows.length && !editing ? <p className="profile-empty">No equipment issued.</p> : null}
      <div className="profile-equipment-grid">
        {visible.map(({ row, index }) => {
          const expires = equipmentExpiration(row);
          const nfpa = !row.expirationDate && suggestedRetirement(row);
          if (!editing) {
            return (
              <article key={row.id} className={`profile-equip-card ${isEquipmentInHand(row) ? "" : "is-out"}`}>
                <header>
                  <div>
                    <strong>{row.item || row.category || "Item"}</strong>
                    <span className="profile-muted">{[row.category !== row.item ? row.category : "", row.manufacturer, row.model].filter(Boolean).join(" · ")}</span>
                  </div>
                  <span className={`profile-badge ${row.status === "Issued" ? "is-ok" : ""}`}>{row.status}</span>
                </header>
                <dl>
                  <div><dt>Serial</dt><dd className="profile-mono">{row.serial || "—"}</dd></div>
                  <div><dt>Size</dt><dd>{row.size || "—"}</dd></div>
                  <div><dt>Manufactured</dt><dd>{row.mfgDate ? formatPersonnelDateForDisplay(row.mfgDate) : "—"}</dd></div>
                  <div><dt>Issued</dt><dd>{row.issuedDate ? formatPersonnelDateForDisplay(row.issuedDate) : "—"}</dd></div>
                  <div className="is-wide">
                    <dt>{nfpa ? "Retire by (NFPA 10-yr)" : "Expires"}</dt>
                    <dd>{expires ? <>{formatPersonnelDateForDisplay(expires)} {isEquipmentInHand(row) ? <ExpiryBadge date={expires} /> : null}</> : "—"}</dd>
                  </div>
                </dl>
                {row.notes ? <p className="profile-muted">{row.notes}</p> : null}
              </article>
            );
          }
          return (
            <article key={row.id} className="profile-equip-card is-editing">
              <dl className="profile-grid">
                {EQUIPMENT_FIELDS.map(([key, label, type]) => (
                  <div key={key} className={type === "wide" ? "is-wide" : ""}>
                    <dt>{label}</dt>
                    <dd>
                      {type === "category" ? <ComboField value={row.category} options={EQUIPMENT_CATEGORIES} onChange={(next) => update(index, { category: next })} ariaLabel={label} />
                        : type === "status" ? <ComboField value={row.status} options={EQUIPMENT_STATUSES} onChange={(next) => update(index, { status: next })} ariaLabel={label} />
                          : type === "date" ? <input type="date" value={formatPersonnelDateForInput(row[key])} onChange={(event) => update(index, { [key]: event.target.value })} aria-label={label} />
                            : <input value={row[key] || ""} onChange={(event) => update(index, { [key]: event.target.value })} aria-label={label} />}
                    </dd>
                  </div>
                ))}
              </dl>
              {nfpa ? (
                <p className="profile-hint">
                  NFPA 1851 retirement: {formatPersonnelDateForDisplay(nfpa)}. <button type="button" className="profile-link" onClick={() => update(index, { expirationDate: nfpa })}>Use as expiration</button>
                </p>
              ) : null}
              <footer>
                <button type="button" className="profile-icon-btn" disabled={index === 0} onClick={() => onChange(moveRow(rows, index, -1))} title="Move up" aria-label="Move up"><ArrowUp size={15} /></button>
                <button type="button" className="profile-icon-btn" disabled={index === rows.length - 1} onClick={() => onChange(moveRow(rows, index, 1))} title="Move down" aria-label="Move down"><ArrowDown size={15} /></button>
                <button type="button" className="profile-icon-btn is-danger" onClick={() => onChange(rows.filter((_, i) => i !== index))} title="Remove" aria-label="Remove"><Trash2 size={15} /> Remove</button>
              </footer>
            </article>
          );
        })}
      </div>
      {editing ? (
        <button type="button" className="secondary-button profile-add" onClick={() => onChange([...rows, emptyEquipment()])}><Plus size={14} /> Add equipment</button>
      ) : hiddenCount > 0 ? (
        <button type="button" className="profile-link" onClick={() => setShowAll(true)}>Show {hiddenCount} returned or retired item{hiddenCount === 1 ? "" : "s"}</button>
      ) : null}
    </div>
  );
}

/** A small table for read-only history rows (rank history, immunizations…). */
export function HistoryTable({ columns, rows, empty }) {
  if (!rows.length) return <p className="profile-empty">{empty}</p>;
  return (
    <div className="profile-table-wrap">
      <table className="profile-table">
        <thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map(([key, label, type]) => <td key={label}>{type === "date" ? (row[key] ? formatPersonnelDateForDisplay(row[key]) : "—") : type === "expires" ? (row[key] ? <>{formatPersonnelDateForDisplay(row[key])} <ExpiryBadge date={row[key]} /></> : "—") : row[key] || "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Editable rows of simple fields (immunizations). columns: [key, label, type]. */
export function RowsEditor({ columns, rows, onChange, addLabel }) {
  const update = (index, patch) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <div className="profile-rows">
      {rows.map((row, index) => (
        <div key={row.id || index} className="profile-row-edit">
          {columns.map(([key, label, type]) => (
            <input key={key} type={type === "date" || type === "expires" ? "date" : "text"} value={type === "date" || type === "expires" ? formatPersonnelDateForInput(row[key]) : row[key] || ""} placeholder={label} aria-label={label} onChange={(event) => update(index, { [key]: event.target.value })} />
          ))}
          <button type="button" className="profile-icon-btn" onClick={() => onChange(rows.filter((_, i) => i !== index))} title="Remove" aria-label="Remove"><Trash2 size={15} /></button>
        </div>
      ))}
      <button type="button" className="secondary-button profile-add" onClick={() => onChange([...rows, { id: `row-${Date.now().toString(36)}` }])}><Plus size={14} /> {addLabel}</button>
    </div>
  );
}
