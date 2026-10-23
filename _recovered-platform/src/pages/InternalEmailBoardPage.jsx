import { Mail } from "lucide-react";
import InternalEmailBoard from "../components/InternalEmailBoard.jsx";
import { useTenant } from "../context/TenantContext.jsx";

export default function InternalEmailBoardPage() {
  const { profile, platformConfig, isPlatformScope } = useTenant();
  const title = isPlatformScope
    ? `${platformConfig?.platformTitle || "FORGE"} Internal Email`
    : `${profile?.shortName || profile?.name || "Department"} Internal Email`;

  return (
    <div className="module-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><Mail size={22} /></span>
          <div>
            <h1>{title}</h1>
            <p>Department-scoped internal messaging. Enable or disable this module per branch in Creator Console.</p>
          </div>
        </div>
      </section>
      <InternalEmailBoard />
    </div>
  );
}
