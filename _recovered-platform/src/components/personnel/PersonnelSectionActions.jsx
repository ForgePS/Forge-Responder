export default function PersonnelSectionActions({ canEdit, onSave, onCancel }) {
  if (!canEdit) return null;

  return (
    <footer className="personnel-form-actions">
      <button type="button" className="primary-button" onClick={onSave}>Save</button>
      <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
    </footer>
  );
}
