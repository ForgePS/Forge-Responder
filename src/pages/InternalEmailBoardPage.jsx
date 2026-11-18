import { Mail } from "lucide-react";
import InternalEmailBoard from "../components/InternalEmailBoard.jsx";
import { useTenant } from "../context/TenantContext.jsx";

export default function InternalEmailBoardPage({ personnel = [] }) {
  const { profile } = useTenant();
  const title = `${profile?.shortName || profile?.name || "Department"} Messages`;

  return (
    <div className="module-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><Mail size={22} /></span>
          <div>
            <h1>{title}</h1>
            <p>Send announcements, alerts and messages to your people. Messages stay inside this department.</p>
          </div>
        </div>
      </section>
      <InternalEmailBoard personnelRecords={personnel} />
    </div>
  );
}
