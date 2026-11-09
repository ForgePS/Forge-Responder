const IMAGE_TYPES = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

/** Whether the document has a real file attached (seed data uses "#"). */
export function documentHasFile(doc = {}) {
  const url = String(doc.fileUrl || "").trim();
  return Boolean(url) && url !== "#";
}

/** What kind of inline preview a document's file supports: "pdf", "image" or "". */
export function documentPreviewKind(doc = {}) {
  if (!documentHasFile(doc)) return "";
  const type = String(doc.fileType || "").trim().toLowerCase().replace(/^\./, "");
  const ext = (String(doc.fileUrl).split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  if (type === "pdf" || ext === "pdf") return "pdf";
  if (IMAGE_TYPES.includes(type) || IMAGE_TYPES.includes(ext)) return "image";
  return "";
}
