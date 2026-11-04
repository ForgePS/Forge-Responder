/**
 * My Profile: the person's full record in one page — who they are, how to
 * reach them, credentials, employment, issued equipment, health and account.
 * Everyone edits their own contact details and emergency contacts; personnel
 * administrators edit everything. Private values (SSN, birth date…) are loaded
 * from personnelPrivate and shown masked.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BadgeCheck, Briefcase, ClipboardList, Contact, FileText, HardHat, HeartPulse, KeyRound, Pencil,
  Save, ShieldCheck, UserRound, X,
} from "lucide-react";
import { usePersonnelPrivate } from "../../hooks/usePersonnelPrivate.js";
import { savePersonnelPrivate } from "../../lib/personnelPrivateService.js";
import { isPersonnelPrivateKey, mergePersonnelPrivate, privateFieldsPatch } from "../../lib/personnelPrivateFields.js";
import { formatEmergencyContactSummaryAll } from "../../lib/personnelContact.js";
import { formatPersonnelDateForDisplay } from "../../lib/personnelDates.js";
import { documentDisplayName, documentDownloadUrl } from "../../lib/storagePaths.js";
import { isObjectVisibleInActiveList } from "../../lib/objectLifecycle.js";
import { requestPasswordReset } from "../../lib/accountService.js";
import {
  PROFILE_GROUPS, SELF_EDIT_KEYS, contactPatch, isEquipmentInHand, lengthOfService, normalizeEquipment,
  profileAttention, profileEmails, profilePhones, usableEquipment,
} from "../../lib/personnelProfile.js";
import { ContactList, EmergencyContacts, ExpiryBadge, FieldGroup, HistoryTable, IssuedEquipment, RowsEditor } from "./ProfileParts.jsx";
import "./MyProfile.css";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: UserRound },
  { id: "personal", label: "Personal", icon: ClipboardList },
  { id: "contact", label: "Contact", icon: Contact },
  { id: "credentials", label: "Credentials", icon: BadgeCheck },
  { id: "employment", label: "Employment", icon: Briefcase },
  { id: "equipment", label: "Issued equipment", icon: HardHat },
  { id: "health", label: "Health", icon: HeartPulse },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "account", label: "Account", icon: KeyRound },
];

const EMERGENCY_KEYS = SELF_EDIT_KEYS.filter((key) => key.startsWith("emergency") && key !== "emergency");
const IMMUNIZATION_COLUMNS = [["vaccine", "Vaccine"], ["date", "Date", "date"], ["expiration", "Expires", "expires"], ["status", "Status"]];

function initialsOf(person) {
  return [person.firstName, person.lastName].map((part) => String(part || "").trim()[0] || "").join("").toUpperCase() || "?";
}

function currentPayRate(person) {
  const rows = (person.payRates || []).filter((row) => row?.rate);
  if (!rows.length) return person.hourlyPayRate ? { rate: person.hourlyPayRate, type: "Hourly" } : null;
  return [...rows].sort((a, b) => String(b.effectiveDate || "").localeCompare(String(a.effectiveDate || "")))[0];
}

/** A card with a title, optional Edit, and Save/Cancel while editing. */
function Card({ id, title, icon: Icon, editable, editing, onEdit, onCancel, onSave, saving, children, note }) {
  return (
    <section className={`profile-card ${editing ? "is-editing" : ""}`} aria-labelledby={`${id}-title`}>
      <header className="profile-card-head">
        <h3 id={`${id}-title`}>{Icon ? <Icon size={16} /> : null}{title}</h3>
        {editing ? (
          <div className="profile-card-actions">
            <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}><X size={14} /> Cancel</button>
            <button type="button" className="primary-button" onClick={onSave} disabled={saving}><Save size={14} /> {saving ? "Saving…" : "Save"}</button>
          </div>
        ) : editable ? (
          <button type="button" className="secondary-button" onClick={onEdit}><Pencil size={14} /> Edit</button>
        ) : null}
      </header>
      {note ? <p className="profile-hint">{note}</p> : null}
      {children}
    </section>
  );
}

export default function MyProfile({
  person, setPersonnel, certifications = [], user, membership, roleLabel = "", departmentId, canEditAll = false, onNavigate,
}) {
  const privateState = usePersonnelPrivate(departmentId, person?.id, Boolean(person?.id));
  const privateReady = privateState.status === "ready";
  const values = useMemo(() => mergePersonnelPrivate(person || {}, privateState.fields), [person, privateState.fields]);
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [active, setActive] = useState("overview");
  const containerRef = useRef(null);

  // Highlight the section being read.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.dataset.section);
    }, { rootMargin: "-80px 0px -60% 0px" });
    root.querySelectorAll("[data-section]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const attention = useMemo(() => profileAttention(values, certifications), [values, certifications]);
  const phones = profilePhones(values);
  const emails = profileEmails(values);
  const equipment = normalizeEquipment(values.issuedEquipment);
  const inHand = equipment.filter(isEquipmentInHand);
  const pay = currentPayRate(values);
  const docs = (values.documents || []).filter((doc) => typeof doc === "string" || isObjectVisibleInActiveList(doc));

  if (!person) return null;

  const canEditField = (field) => canEditAll || (field.self && !field.private);
  const groupEditable = (...groups) => canEditAll || groups.some((group) => group.fields.some((field) => field.self));
  const start = (card, extra = {}) => {
    setDraft({ ...values, phonesDraft: phones, emailsDraft: emails, equipmentDraft: equipment, immunizationsDraft: values.immunizations || [], ...extra });
    setEditing(card);
    setMessage(null);
  };
  const cancel = () => { setEditing(""); setDraft({}); };
  const change = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const shown = (card) => (editing === card ? draft : values);

  async function save(card, keys) {
    let patch = {};
    if (card === "contact-lists") patch = contactPatch(draft.phonesDraft, draft.emailsDraft);
    else if (card === "equipment") patch = { issuedEquipment: usableEquipment(draft.equipmentDraft) };
    else if (card === "immunizations") patch = { immunizations: (draft.immunizationsDraft || []).filter((row) => Object.entries(row).some(([key, value]) => key !== "id" && String(value || "").trim())) };
    else keys.forEach((key) => { patch[key] = draft[key] ?? ""; });
    if (card === "emergency") patch.emergency = formatEmergencyContactSummaryAll({ ...values, ...patch });

    const privatePart = {};
    const publicPart = {};
    Object.entries(patch).forEach(([key, value]) => {
      if (isPersonnelPrivateKey(key)) privatePart[key] = value;
      else if (canEditAll || SELF_EDIT_KEYS.includes(key)) publicPart[key] = value;
    });
    setSaving(true);
    try {
      if (canEditAll && Object.keys(privatePart).length) {
        const privatePatch = privateFieldsPatch({ ...privateState.fields, ...privatePart }, privateState.fields);
        if (Object.keys(privatePatch).length) {
          await savePersonnelPrivate(departmentId, person.id, privatePatch, { userId: user?.uid || "" });
          privateState.applySaved(privatePatch);
        }
      }
      if (Object.keys(publicPart).length) {
        const stamped = { ...publicPart, updatedAt: new Date().toISOString() };
        setPersonnel((current) => current.map((row) => (row.id === person.id ? { ...row, ...stamped } : row)));
      }
      setEditing("");
      setDraft({});
      setMessage({ tone: "ok", text: "Saved." });
    } catch (error) {
      setMessage({ tone: "bad", text: error?.code === "permission-denied" ? "You don't have permission to change that." : "Couldn't save. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const groupKeys = (...groups) => groups.flatMap((group) => group.fields).filter(canEditField).map((field) => field.key);
  const cardProps = (card, groups, { editable } = {}) => ({
    editable: editable ?? groupEditable(...groups),
    editing: editing === card,
    onEdit: () => start(card),
    onCancel: cancel,
    onSave: () => save(card, groupKeys(...groups)),
    saving,
  });
  const go = (id) => {
    const element = containerRef.current?.querySelector(`[data-section="${id}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
  };
  const lastSignIn = user?.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime) : null;
  const G = PROFILE_GROUPS;

  return (
    <div className="profile-page" ref={containerRef}>
      <nav className="profile-nav" aria-label="Profile sections">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const count = section.id === "overview" ? attention.length : attention.filter((item) => item.area === section.id).length;
          return (
            <button key={section.id} type="button" className={active === section.id ? "is-active" : ""} onClick={() => go(section.id)} aria-current={active === section.id ? "true" : undefined}>
              <Icon size={16} /> <span>{section.label}</span>
              {count && section.id !== "overview" ? <i className="profile-nav-dot" aria-label={`${count} need attention`}>{count}</i> : null}
            </button>
          );
        })}
      </nav>

      <div className="profile-main">
        {message ? <div className={`profile-message is-${message.tone}`} role="status">{message.text}</div> : null}

        {/* ---------------- Overview ---------------- */}
        <div data-section="overview" className="profile-section">
          <section className="profile-hero">
            {values.photoUrl ? <img src={values.photoUrl} alt="" className="profile-photo" /> : <span className="profile-photo is-initials" aria-hidden="true">{initialsOf(values)}</span>}
            <div className="profile-hero-text">
              <h2>{[values.firstName, values.middleName, values.lastName].filter(Boolean).join(" ") || values.name}</h2>
              <p>{[values.rank, values.position && values.position !== values.rank ? values.position : ""].filter(Boolean).join(" · ") || "—"}</p>
              <div className="profile-hero-tags">
                {values.status ? <span className={`profile-badge ${/active/i.test(values.status) ? "is-ok" : ""}`}>{values.status}</span> : null}
                {values.shift ? <span className="profile-badge">{values.shift}</span> : null}
                {values.station ? <span className="profile-badge">{values.station}</span> : null}
                {values.badgeNumber ? <span className="profile-badge">Badge {values.badgeNumber}</span> : null}
              </div>
            </div>
            <dl className="profile-hero-stats">
              <div><dt>Service</dt><dd>{lengthOfService(values.hireDate) || "—"}</dd></div>
              <div><dt>Hired</dt><dd>{values.hireDate ? formatPersonnelDateForDisplay(values.hireDate) : "—"}</dd></div>
              <div><dt>Equipment</dt><dd>{inHand.length} item{inHand.length === 1 ? "" : "s"}</dd></div>
              <div><dt>Certifications</dt><dd>{certifications.length}</dd></div>
            </dl>
          </section>
          {attention.length ? (
            <section className="profile-attention" aria-label="Needs attention">
              <h3><AlertTriangle size={16} /> Needs attention</h3>
              <ul>
                {attention.slice(0, 8).map((item) => (
                  <li key={`${item.area}-${item.label}-${item.date}`}>
                    <button type="button" onClick={() => go(item.area)}>
                      <span className={`profile-badge is-${item.state}`}>{item.state === "expired" ? "Expired" : `${item.days} day${item.days === 1 ? "" : "s"}`}</span>
                      <strong>{item.label}</strong>
                      <span className="profile-muted">{formatPersonnelDateForDisplay(item.date)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="profile-allclear"><ShieldCheck size={16} /> Everything on file is current.</p>
          )}
        </div>

        {/* ---------------- Personal ---------------- */}
        <div data-section="personal" className="profile-section">
          <h2 className="profile-section-title">Personal</h2>
          <Card id="card-identity" title="Name & personal details" icon={UserRound} {...cardProps("personal", [G.identity, G.personal])}
            note={!privateReady && privateState.status !== "loading" ? "Private details aren't available on this account." : ""}>
            <FieldGroup group={G.identity} values={shown("personal")} editing={editing === "personal"} onChange={change} canEdit={canEditField} />
            <FieldGroup group={G.personal} values={shown("personal")} editing={editing === "personal"} onChange={change} canEdit={canEditField} privateReady={privateReady} />
          </Card>
          <Card id="card-license" title="Driver's license" icon={ClipboardList} {...cardProps("license", [G.license])}>
            <FieldGroup group={G.license} values={shown("license")} editing={editing === "license"} onChange={change} canEdit={canEditField} privateReady={privateReady} />
          </Card>
        </div>

        {/* ---------------- Contact ---------------- */}
        <div data-section="contact" className="profile-section">
          <h2 className="profile-section-title">Contact</h2>
          <Card id="card-phones" title="Phone & email" icon={Contact} {...cardProps("contact-lists", [], { editable: true })}>
            <div className="profile-two-col">
              <div>
                <h4>Phone numbers</h4>
                <ContactList kind="phone" rows={editing === "contact-lists" ? draft.phonesDraft : phones} editing={editing === "contact-lists"} onChange={(rows) => change("phonesDraft", rows)} />
              </div>
              <div>
                <h4>Email addresses</h4>
                <ContactList kind="email" rows={editing === "contact-lists" ? draft.emailsDraft : emails} editing={editing === "contact-lists"} onChange={(rows) => change("emailsDraft", rows)} />
              </div>
            </div>
          </Card>
          <Card id="card-address" title="Home address" icon={Contact} {...cardProps("address", [G.address])}>
            <FieldGroup group={G.address} values={shown("address")} editing={editing === "address"} onChange={change} canEdit={canEditField} />
          </Card>
          <Card id="card-emergency" title="Emergency contacts" icon={Contact} {...cardProps("emergency", [], { editable: true })} onSave={() => save("emergency", EMERGENCY_KEYS)}>
            <EmergencyContacts values={shown("emergency")} editing={editing === "emergency"} onChange={change} />
          </Card>
        </div>

        {/* ---------------- Credentials ---------------- */}
        <div data-section="credentials" className="profile-section">
          <h2 className="profile-section-title">Credentials</h2>
          <Card id="card-licensure" title="EMS licensure" icon={BadgeCheck} {...cardProps("licensure", [G.nationalRegistry, G.stateLicense, G.agencyLicense])}>
            <div className="profile-subcards">
              {[G.nationalRegistry, G.stateLicense, G.agencyLicense].map((group) => (
                <section key={group.title} className="profile-subcard">
                  <h4>{group.title}</h4>
                  <FieldGroup group={group} values={shown("licensure")} editing={editing === "licensure"} onChange={change} canEdit={canEditField} />
                </section>
              ))}
            </div>
          </Card>
          <Card id="card-education" title="Education" icon={BadgeCheck} {...cardProps("education", [G.education])}>
            <FieldGroup group={G.education} values={shown("education")} editing={editing === "education"} onChange={change} canEdit={canEditField} />
          </Card>
          <Card id="card-certs" title="Additional certifications" icon={BadgeCheck} editable={false}>
            <HistoryTable
              columns={[["type", "Certification"], ["category", "Category"], ["id", "Certification ID"], ["issue", "Issued", "date"], ["expires", "Expires", "expires"], ["status", "Status"]]}
              rows={certifications}
              empty="No certifications on file."
            />
            {onNavigate ? <button type="button" className="profile-link" onClick={() => onNavigate("Certifications")}>Open Certifications</button> : null}
          </Card>
        </div>

        {/* ---------------- Employment ---------------- */}
        <div data-section="employment" className="profile-section">
          <h2 className="profile-section-title">Employment</h2>
          <Card id="card-assignment" title="Assignment & identifiers" icon={Briefcase} {...cardProps("assignment", [G.ids, G.assignment])}>
            <FieldGroup group={G.ids} values={shown("assignment")} editing={editing === "assignment"} onChange={change} canEdit={canEditField} />
            <FieldGroup group={G.assignment} values={shown("assignment")} editing={editing === "assignment"} onChange={change} canEdit={canEditField} />
            <dl className="profile-grid">
              <div><dt>Personnel ID</dt><dd>{values.id}</dd></div>
              <div><dt>Total length of service</dt><dd>{lengthOfService(values.hireDate) || "—"}</dd></div>
              <div><dt>Pay rate</dt><dd>{pay ? `$${pay.rate}${pay.type ? ` · ${pay.type}` : ""}` : "—"}</dd></div>
            </dl>
          </Card>
          <Card id="card-history" title="Rank & employment history" icon={Briefcase} editable={false}>
            <h4>Rank / position</h4>
            <HistoryTable columns={[["rank", "Rank"], ["promotionDate", "Date", "date"], ["notes", "Notes"]]} rows={values.promotions || []} empty="No promotions on file." />
            <h4>Employment</h4>
            <HistoryTable columns={[["rank", "Rank"], ["unit", "Unit"], ["station", "Station"], ["startDate", "Start", "date"], ["endDate", "End", "date"]]} rows={values.employmentHistory || []} empty="No employment history on file." />
          </Card>
        </div>

        {/* ---------------- Equipment ---------------- */}
        <div data-section="equipment" className="profile-section">
          <h2 className="profile-section-title">Issued equipment</h2>
          <Card id="card-equipment" title={`${inHand.length} item${inHand.length === 1 ? "" : "s"} issued`} icon={HardHat} {...cardProps("equipment", [], { editable: canEditAll })}
            note={editing === "equipment" ? "Structural gear (coat, pants, helmet, boots, gloves, hood) retires 10 years after manufacture under NFPA 1851; it's used as the expiration when none is entered." : ""}>
            <IssuedEquipment rows={editing === "equipment" ? draft.equipmentDraft : equipment} editing={editing === "equipment"} onChange={(rows) => change("equipmentDraft", rows)} />
          </Card>
        </div>

        {/* ---------------- Health ---------------- */}
        <div data-section="health" className="profile-section">
          <h2 className="profile-section-title">Health</h2>
          <Card id="card-immunizations" title="Immunizations" icon={HeartPulse} {...cardProps("immunizations", [], { editable: canEditAll })}>
            {editing === "immunizations"
              ? <RowsEditor columns={IMMUNIZATION_COLUMNS} rows={draft.immunizationsDraft} onChange={(rows) => change("immunizationsDraft", rows)} addLabel="Add immunization" />
              : <HistoryTable columns={IMMUNIZATION_COLUMNS} rows={values.immunizations || []} empty="No immunization records on file." />}
          </Card>
        </div>

        {/* ---------------- Documents ---------------- */}
        <div data-section="documents" className="profile-section">
          <h2 className="profile-section-title">Documents</h2>
          <Card id="card-docs" title={`${docs.length} document${docs.length === 1 ? "" : "s"}`} icon={FileText} editable={false}
            note={canEditAll ? "Upload documents from Personnel → Attachments." : ""}>
            {docs.length ? (
              <ul className="profile-docs">
                {docs.map((doc, index) => {
                  const url = typeof doc === "string" ? "" : documentDownloadUrl(doc);
                  const name = typeof doc === "string" ? doc : documentDisplayName(doc);
                  return (
                    <li key={(doc && doc.id) || index}>
                      <FileText size={16} />
                      {url ? <a href={url} target="_blank" rel="noreferrer">{name}</a> : <span>{name}</span>}
                      {doc?.uploadedAt ? <span className="profile-muted">{formatPersonnelDateForDisplay(doc.uploadedAt)}</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="profile-empty">No documents on file.</p>}
          </Card>
        </div>

        {/* ---------------- Account ---------------- */}
        <div data-section="account" className="profile-section">
          <h2 className="profile-section-title">Account</h2>
          <AccountCard user={user} membership={membership} roleLabel={roleLabel} lastSignIn={lastSignIn} />
        </div>
      </div>
    </div>
  );
}

function AccountCard({ user, membership, roleLabel, lastSignIn }) {
  const [resetState, setResetState] = useState("");
  return (
    <Card id="card-account" title="Sign-in & access" icon={KeyRound} editable={false}>
      <dl className="profile-grid">
        <div><dt>Sign-in email</dt><dd>{user?.email || "—"}</dd></div>
        <div><dt>Permission group</dt><dd>{roleLabel || membership?.role || "—"}</dd></div>
        <div><dt>Account status</dt><dd>{membership?.status ? <span className={`profile-badge ${/active/i.test(membership.status) ? "is-ok" : ""}`}>{membership.status}</span> : "—"}</dd></div>
        <div><dt>Last sign-in</dt><dd>{lastSignIn ? lastSignIn.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"}</dd></div>
        <div className="is-wide">
          <dt>Password</dt>
          <dd className="profile-account-actions">
            <span className="profile-muted">Change it from the account menu (your initials, top right), or get a reset link by email.</span>
            <button
              type="button"
              className="secondary-button"
              disabled={!user?.email || resetState === "sending" || resetState === "sent"}
              onClick={async () => {
                setResetState("sending");
                try {
                  await requestPasswordReset(user.email);
                  setResetState("sent");
                } catch {
                  setResetState("error");
                }
              }}
            >
              {resetState === "sent" ? "Reset link sent" : resetState === "sending" ? "Sending…" : "Email me a reset link"}
            </button>
            {resetState === "error" ? <span className="profile-error">Couldn't send the link. Try again later.</span> : null}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

