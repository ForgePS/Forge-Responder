import { ExternalLink } from "lucide-react";
import { leaveDemoToProduction } from "../lib/demoMode.js";
import { demoDepartmentProfile } from "../data/demoDepartment.js";

export default function DemoModeBanner() {
  return (
    <div className="demo-mode-banner">
      <div>
        <strong>Demo / Training Mode</strong>
        <span>{demoDepartmentProfile.name} — sample data only. Changes stay in the demo sandbox.</span>
      </div>
      <button className="secondary-button" type="button" onClick={leaveDemoToProduction}>
        <ExternalLink size={14} /> Exit to production
      </button>
    </div>
  );
}
