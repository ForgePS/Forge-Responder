import { useMemo, useState } from "react";
import { BookOpen, Building2, Inbox, LifeBuoy, MailCheck } from "lucide-react";
import HelpDeskBoard from "../components/helpDesk/HelpDeskBoard.jsx";
import HelpDeskSettingsPanel from "../components/helpDesk/HelpDeskSettingsPanel.jsx";
import HelpArticles from "../components/helpDesk/HelpArticles.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { isDepartmentAdminMembership } from "../lib/helpDesk/constants.js";
import { helpDeskContextPage, ticketIdFromLocation } from "../lib/helpDesk/launch.js";
import { isPlatformScope } from "../lib/tenantPaths.js";

/**
 * Help Desk in the RMS: anyone signed in opens requests and follows their own;
 * department admins (and creators in this department) also work the department queue
 * and keep the department's notification list.
 */
export default function HelpDeskPage({ embedded = false }) {
  const { membership, isCreator } = useAuth();
  const { departmentId, profile } = useTenant();
  const departmentName = profile?.shortName || profile?.name || "";
  const isStaff = Boolean(isCreator || isDepartmentAdminMembership(membership));
  const initialTicketId = useMemo(() => ticketIdFromLocation(), []);
  const [contextPage] = useState(() => helpDeskContextPage());
  const [tab, setTab] = useState(() => (initialTicketId && isStaff ? "queue" : "mine"));
  const [composeSignal, setComposeSignal] = useState(0);

  const tabs = [
    ["mine", "My requests", Inbox],
    ...(isStaff ? [["queue", "Department queue", Building2]] : []),
    ["articles", "Help articles", BookOpen],
    ...(isStaff ? [["settings", "Notifications", MailCheck]] : []),
  ];

  if (isPlatformScope(departmentId)) {
    return (
      <div className="module-page hd-page">
        <section className="module-heading"><div><span className="module-icon"><LifeBuoy size={22} /></span><div><h1>Help Desk</h1><p>Help requests from every department are in the Creator Console under Help Desk.</p></div></div></section>
      </div>
    );
  }

  function ask() {
    setTab("mine");
    setComposeSignal((value) => value + 1);
  }

  return (
    <div className={embedded ? "hd-page" : "module-page hd-page"}>
      <section className="module-heading" hidden={embedded}>
        <div>
          <span className="module-icon"><LifeBuoy size={22} /></span>
          <div>
            <h1>Help Desk</h1>
            <p>Report a problem, ask a question or request a feature. FORGE support{departmentName ? ` and ${departmentName}'s admins` : ""} will reply here and by email.</p>
          </div>
        </div>
      </section>
      <section className="cert-toolbar admin-tab-toolbar">
        <div className="segmented-control admin-tab-bar hd-tabs" role="tablist" aria-label="Help Desk">
          {tabs.map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </section>
      {tab === "mine" ? (
        <HelpDeskBoard
          mode="mine"
          departmentId={departmentId}
          departmentName={departmentName}
          contextPage={contextPage}
          initialTicketId={isStaff ? "" : initialTicketId}
          composeSignal={composeSignal}
          compact
        />
      ) : null}
      {tab === "queue" && isStaff ? (
        <HelpDeskBoard
          mode="department"
          departmentId={departmentId}
          departmentName={departmentName}
          contextPage={contextPage}
          initialTicketId={initialTicketId}
          compact
        />
      ) : null}
      {tab === "articles" ? <HelpArticles onAsk={ask} /> : null}
      {tab === "settings" && isStaff ? (
        <section className="panel hd-panel">
          <header><div><MailCheck size={15} /><strong>Who gets new requests by email</strong></div></header>
          <div className="panel-body"><HelpDeskSettingsPanel scope={departmentId} /></div>
        </section>
      ) : null}
    </div>
  );
}
