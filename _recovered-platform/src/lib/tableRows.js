export function normalizeTableRow(row) {
  if (Array.isArray(row)) {
    return row.map((cell) => (cell == null ? "" : String(cell)));
  }
  if (row && typeof row === "object" && "v0" in row) {
    return [row.v0 ?? "", row.v1 ?? "", row.v2 ?? "", row.v3 ?? ""].filter((cell, index) => index < 3 || cell !== "");
  }
  return [row == null ? "" : String(row)];
}

export function normalizeTableRows(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeTableRow);
}
