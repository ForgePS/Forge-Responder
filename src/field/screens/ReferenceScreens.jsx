/**
 * Reference screens for the EMS, Important contacts and HazMat quick cards.
 * Contacts and drug dosages come from Admin → FORGE FIELD; protocol and HazMat
 * documents from Documents. Everything except the outside links works offline.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, ExternalLink, FileText, Phone, Search, Syringe, X } from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { refItems } from "../fieldRefData.js";
import { usableContacts, usableDrugDosages } from "../fieldAppConfig.js";
import { HAZMAT_LINKS } from "../fieldReference.js";
import { getSavedPlanFile, openPlanFile, savePlanFileOffline } from "../fieldPlanFiles.js";
import { Banner, Screen, Section, Segmented, cx } from "../ui.jsx";

function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="fa-search">
      <Search size={20} aria-hidden="true" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} enterKeyHint="search" autoComplete="off" />
      {value ? <button type="button" className="fa-icon-btn sm" onClick={() => onChange("")} aria-label="Clear"><X size={18} /></button> : null}
    </label>
  );
}

const matches = (query, ...values) => {
  const q = query.trim().toLowerCase();
  return !q || values.join(" ").toLowerCase().includes(q);
};

/** Documents kept on the phone: saved for offline use when there's signal. */
function DocumentList({ docs, empty, tone }) {
  const { online } = useField();
  const [saved, setSaved] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = {};
      for (const doc of docs) {
        const file = { url: doc.fileUrl, name: doc.fileName || doc.title };
        next[doc.id] = Boolean(await getSavedPlanFile(file.url)) || (online && (await savePlanFileOffline(file)) === "saved");
        if (cancelled) return;
      }
      setSaved(next);
    })();
    return () => { cancelled = true; };
  }, [docs, online]);

  if (!docs.length) return <p className="fa-empty">{empty}</p>;
  return (
    <div className="fa-tiles">
      {docs.map((doc) => (
        <button
          key={doc.id}
          type="button"
          className={cx("fa-tile fa-tool", `tone-${tone}`)}
          onClick={() => openPlanFile({ url: doc.fileUrl, name: doc.fileName || doc.title })}
        >
          <span className="fa-tile-icon"><FileText size={24} /></span>
          <span className="fa-tile-text">
            <strong>{doc.title}</strong>
            <small>{saved[doc.id] ? "Saved on this device" : online ? "Opens online" : "Needs signal the first time"}{doc.description ? ` · ${doc.description}` : ""}</small>
          </span>
          {saved[doc.id] ? <CheckCircle2 size={20} className="fa-tile-chev" aria-label="Saved on this device" /> : <ExternalLink size={20} className="fa-tile-chev" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

export function EmsProtocolsScreen() {
  const { back, refData } = useField();
  const [query, setQuery] = useState("");
  const all = refItems(refData, "referenceDocs").filter((doc) => doc.kind === "ems");
  const docs = useMemo(() => all.filter((doc) => matches(query, doc.title, doc.description)), [all, query]);
  return (
    <Screen title="EMS protocols" subtitle={all.length ? `${all.length} protocol${all.length === 1 ? "" : "s"}` : ""} onBack={back} wide>
      {all.length > 6 ? <SearchBox value={query} onChange={setQuery} placeholder="Search protocols" /> : null}
      <DocumentList
        docs={docs}
        tone="blue"
        empty={all.length ? "No protocol matches your search." : "No EMS protocols yet. Upload them in FORGE Responder → Documents → EMS Protocols."}
      />
    </Screen>
  );
}

export function DrugDosagesScreen() {
  const { back, config } = useField();
  const [query, setQuery] = useState("");
  const [patient, setPatient] = useState("adult");
  const all = useMemo(() => usableDrugDosages(config?.drugDosages), [config?.drugDosages]);
  const rows = all
    .filter((row) => (patient === "adult" ? row.adult : row.pediatric))
    .filter((row) => matches(query, row.drug, row.indication, row.route, row.notes));
  return (
    <Screen title="Drug dosages" subtitle="From your department's protocols" onBack={back} wide>
      <Banner tone="warn" icon={<AlertTriangle size={22} />} title="Follow your protocols">
        Entered by your department. Always confirm with your protocols and medical control.
      </Banner>
      {all.length ? (
        <>
          <Segmented value={patient} options={[{ value: "adult", label: "Adult" }, { value: "pediatric", label: "Pediatric" }]} onChange={setPatient} columns={2} ariaLabel="Patient" />
          <SearchBox value={query} onChange={setQuery} placeholder="Search drug or indication" />
          <div className="fa-ref-list">
            {rows.map((row) => (
              <article key={row.id} className="fa-ref-card">
                <header>
                  <span className="fa-tile-icon tone-blue"><Syringe size={20} /></span>
                  <div>
                    <strong>{row.drug}</strong>
                    {row.indication ? <small>{row.indication}</small> : null}
                  </div>
                </header>
                <dl>
                  <div><dt>{patient === "adult" ? "Adult" : "Pediatric"}</dt><dd>{patient === "adult" ? row.adult : row.pediatric}</dd></div>
                  {row.route ? <div><dt>Route</dt><dd>{row.route}</dd></div> : null}
                  {row.notes ? <div><dt>Notes</dt><dd>{row.notes}</dd></div> : null}
                </dl>
              </article>
            ))}
            {!rows.length ? <p className="fa-empty">{query ? "Nothing matches your search." : `No ${patient} doses entered.`}</p> : null}
          </div>
        </>
      ) : (
        <p className="fa-empty">Your department hasn't added drug dosages yet. An administrator adds them in FORGE Responder → Admin → FORGE FIELD → Drug dosages.</p>
      )}
    </Screen>
  );
}

export function ContactsScreen() {
  const { back, config } = useField();
  const [query, setQuery] = useState("");
  const all = useMemo(() => usableContacts(config?.contacts), [config?.contacts]);
  const rows = all.filter((row) => matches(query, row.name, row.group, row.notes, row.phone));
  const groups = [...new Set(rows.map((row) => row.group || "Other"))];
  return (
    <Screen title="Important contacts" subtitle={all.length ? `${all.length} contact${all.length === 1 ? "" : "s"}` : ""} onBack={back} wide>
      {all.length ? (
        <>
          {all.length > 6 ? <SearchBox value={query} onChange={setQuery} placeholder="Search contacts" /> : null}
          {groups.map((group) => (
            <Section key={group} title={group}>
              <div className="fa-ref-list">
                {rows.filter((row) => (row.group || "Other") === group).map((row) => (
                  <a key={row.id} className="fa-tile fa-tool tone-teal" href={`tel:${row.phone.replace(/[^\d+]/g, "")}`}>
                    <span className="fa-tile-icon"><Phone size={22} /></span>
                    <span className="fa-tile-text">
                      <strong>{row.name}</strong>
                      <small>{row.phone}{row.notes ? ` · ${row.notes}` : ""}</small>
                    </span>
                    <span className="fa-ref-call">Call</span>
                  </a>
                ))}
              </div>
            </Section>
          ))}
          {!rows.length ? <p className="fa-empty">No contact matches your search.</p> : null}
        </>
      ) : (
        <p className="fa-empty">No contacts yet. An administrator adds them in FORGE Responder → Admin → FORGE FIELD → Contacts.</p>
      )}
    </Screen>
  );
}

export function HazmatScreen() {
  const { back, refData, online } = useField();
  const docs = refItems(refData, "referenceDocs").filter((doc) => doc.kind === "hazmat");
  return (
    <Screen title="HazMat" onBack={back} wide>
      <Section title="References" hint={online ? "" : "These need signal."}>
        <div className="fa-tiles">
          {HAZMAT_LINKS.map((link) => (
            <a key={link.key} className="fa-tile fa-tool tone-amber" href={link.url} target="_blank" rel="noreferrer">
              <span className="fa-tile-icon"><BookOpen size={24} /></span>
              <span className="fa-tile-text">
                <strong>{link.title}</strong>
                <small>{link.detail}</small>
              </span>
              <ExternalLink size={20} className="fa-tile-chev" aria-hidden="true" />
            </a>
          ))}
        </div>
      </Section>
      <Section title="Department documents">
        <DocumentList
          docs={docs}
          tone="amber"
          empty="No HazMat documents yet. Upload them in FORGE Responder → Documents with “HazMat” in the title."
        />
      </Section>
    </Screen>
  );
}
