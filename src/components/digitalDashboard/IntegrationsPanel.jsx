import Active911IntegrationPanel from "./Active911IntegrationPanel.jsx";

export default function IntegrationsPanel({
  departmentId = "",
  canEdit = false,
  onAddAlertMedia,
}) {
  return (
    <div className="dd-integrations-stack">
      <Active911IntegrationPanel
        departmentId={departmentId}
        canConfigure={false}
        canEdit={canEdit}
        variant="dashboard"
        onAddAlertMedia={onAddAlertMedia}
      />
    </div>
  );
}
