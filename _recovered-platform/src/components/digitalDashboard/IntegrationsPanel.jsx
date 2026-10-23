import Active911IntegrationPanel from "./Active911IntegrationPanel.jsx";
import GoogleApisIntegrationPanel from "./GoogleApisIntegrationPanel.jsx";

export default function IntegrationsPanel({
  departmentId = "",
  canManage = false,
  onAddAlertMedia,
}) {
  return (
    <div className="dd-integrations-stack">
      <GoogleApisIntegrationPanel
        departmentId={departmentId}
        canManage={canManage}
      />
      <Active911IntegrationPanel
        departmentId={departmentId}
        canManage={canManage}
        onAddAlertMedia={onAddAlertMedia}
      />
    </div>
  );
}
