import { MonitorPlay } from "lucide-react";
import DigitalDashboardPanel from "../components/digitalDashboard/DigitalDashboardPanel.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { hasPermission } from "../lib/permissions.js";

export default function DigitalDashboardPage({
  displays = [],
  setDisplays,
  media = [],
  setMedia,
  playlists = [],
  setPlaylists,
  schedules = [],
  setSchedules,
  permissions = {},
  isCreator = false,
}) {
  const { profile } = useTenant();
  const title = profile?.shortName || profile?.name || "Department";

  const canEdit = Boolean(
    isCreator
    || hasPermission(permissions, "editDigitalDashboard")
    || hasPermission(permissions, "manageDigitalDashboard")
    || hasPermission(permissions, "manageSystemSettings")
  );
  const canManage = Boolean(
    isCreator
    || hasPermission(permissions, "manageDigitalDashboard")
    || hasPermission(permissions, "manageSystemSettings")
  );

  return (
    <div className="module-page digital-dashboard-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><MonitorPlay size={22} /></span>
          <div>
            <h1>{title} Digital Dashboard</h1>
            <p>
              Manage wall displays, media loops, and publishing schedules across stations —
              department signage built into FORGE RMS.
            </p>
          </div>
        </div>
      </section>
      <DigitalDashboardPanel
        displays={displays}
        setDisplays={setDisplays}
        media={media}
        setMedia={setMedia}
        playlists={playlists}
        setPlaylists={setPlaylists}
        schedules={schedules}
        setSchedules={setSchedules}
        stationNames={Array.isArray(profile?.stations) ? profile.stations : []}
        canEdit={canEdit}
        canManage={canManage}
      />
    </div>
  );
}
