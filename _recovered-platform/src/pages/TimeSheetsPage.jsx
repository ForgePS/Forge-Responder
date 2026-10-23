import { useState } from "react";
import { ChevronDown, Clock3, Printer } from "lucide-react";
import AdminTimeCardEditor from "../components/admin/AdminTimeCardEditor.jsx";
import TimeCardBulkPrintPanel from "../components/admin/TimeCardBulkPrintPanel.jsx";

function TimeSheetSectionPill({ id, label, icon: Icon, isOpen, onToggle, children }) {
  return (
    <section className={`admin-section${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className={`admin-section-pill${isOpen ? " is-open" : ""}`}
        aria-expanded={isOpen}
        aria-controls={`timesheet-section-${id}`}
        onClick={() => onToggle(id)}
      >
        <Icon size={14} aria-hidden="true" />
        <span>{label}</span>
        <ChevronDown size={14} className="admin-section-pill-chevron" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="admin-section-body" id={`timesheet-section-${id}`}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export default function TimeSheetsPage({
  personnel = [],
  timeCards = [],
  setTimeCards,
  payPeriod = null,
  payRules = null,
  leaveRequests = [],
  roster = [],
  schedulingSettings = {},
  apparatus = [],
  shiftRotation = null,
  shiftTrades = [],
  departmentTitle = "Fire and EMS",
  departmentLogoUrl = "",
}) {
  const [openSections, setOpenSections] = useState(() => new Set());

  function toggleSection(sectionId) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  function isOpen(sectionId) {
    return openSections.has(sectionId);
  }

  return (
    <div className="module-page time-sheets-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><Clock3 size={22} /></span>
          <div>
            <h1>Time Sheets</h1>
            <p>Review pay-period hours, adjust overtime and signatures, and print individually or in bulk.</p>
          </div>
        </div>
      </section>

      <section className="admin-sections">
        <TimeSheetSectionPill
          id="edit"
          label="Edit Time Sheet"
          icon={Clock3}
          isOpen={isOpen("edit")}
          onToggle={toggleSection}
        >
          <AdminTimeCardEditor
            personnel={personnel}
            timeCards={timeCards}
            setTimeCards={setTimeCards}
            payPeriod={payPeriod}
            payRules={payRules}
            leaveRequests={leaveRequests}
            roster={roster}
            schedulingSettings={schedulingSettings}
            apparatus={apparatus}
            shiftRotation={shiftRotation}
            shiftTrades={shiftTrades}
            departmentTitle={departmentTitle}
            departmentLogoUrl={departmentLogoUrl}
          />
        </TimeSheetSectionPill>

        <TimeSheetSectionPill
          id="bulk"
          label="Bulk Print"
          icon={Printer}
          isOpen={isOpen("bulk")}
          onToggle={toggleSection}
        >
          <TimeCardBulkPrintPanel
            personnel={personnel}
            timeCards={timeCards}
            payPeriod={payPeriod}
            payRules={payRules}
            leaveRequests={leaveRequests}
            roster={roster}
            schedulingSettings={schedulingSettings}
            apparatus={apparatus}
            shiftRotation={shiftRotation}
            shiftTrades={shiftTrades}
            departmentTitle={departmentTitle}
            departmentLogoUrl={departmentLogoUrl}
          />
        </TimeSheetSectionPill>
      </section>
    </div>
  );
}
