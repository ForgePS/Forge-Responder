/** Shared Firebase Storage path builders for department/platform uploads. */

export function safeFileName(fileName = "file") {
  const base = String(fileName || "file").trim() || "file";
  return base.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
}

export function fileExtension(fileName = "", fallback = "bin") {
  const match = String(fileName || "").match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : fallback;
}

export function buildDepartmentLogoPath(departmentId, fileName = "logo.png") {
  const ext = fileExtension(fileName, "png");
  return `departments/${departmentId}/logos/department-${Date.now()}.${ext}`;
}

export function buildPlatformLogoPath(fileName = "logo.png") {
  const ext = fileExtension(fileName, "png");
  return `platform/branding/logo-${Date.now()}.${ext}`;
}

export function buildPersonnelPhotoPath(departmentId, personId) {
  return `departments/${departmentId}/personnel-photos/${personId}/${Date.now()}-profile.jpg`;
}

export function buildPersonnelDocumentPath(departmentId, personId, fileName = "document") {
  return `departments/${departmentId}/personnel-documents/${personId}/${Date.now()}-${safeFileName(fileName)}`;
}

export function buildCertificationDocPath(departmentId, recordId, fileName = "credential.pdf") {
  return `departments/${departmentId}/certifications/${recordId}/${Date.now()}-${safeFileName(fileName)}`;
}

export function buildNerisAttachmentPath(departmentId, reportId, fileName = "attachment") {
  return `departments/${departmentId}/neris-attachments/${reportId}/${Date.now()}-${safeFileName(fileName)}`;
}

export function buildHydrantInspectionPhotoPath(departmentId, hydrantId, fileName = "photo.jpg") {
  const scope = hydrantId || "general";
  return `departments/${departmentId}/hydrant-inspections/${scope}/${Date.now()}-${safeFileName(fileName)}`;
}

export function buildPreFirePlanPath(departmentId, planId, fileName = "plan.pdf") {
  return `departments/${departmentId}/pre-fire-plans/${planId}/${Date.now()}-${safeFileName(fileName)}`;
}

export function buildDocumentLibraryPath(departmentId, fileName = "document.pdf") {
  return `departments/${departmentId}/document-library/${Date.now()}-${safeFileName(fileName)}`;
}

export function documentDisplayName(doc) {
  if (!doc) return "";
  if (typeof doc === "string") return doc;
  return doc.name || doc.filename || "Document";
}

export function documentDownloadUrl(doc) {
  if (!doc || typeof doc === "string") return "";
  return doc.downloadUrl || doc.url || "";
}
