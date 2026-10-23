export function defaultValueForColumn(column, collectionName = "") {
  const key = String(column).toLowerCase();

  if (key === "status") return "active";
  if (key === "options") return [];
  if (key === "roleids") return [];
  if (key === "permissions") return {};
  if (key === "read") return false;
  if (key === "active" || key === "isplatformcreator") return false;
  if (key === "module" && collectionName === "dropdowns") return "Personnel";
  if (key === "userid") return "all";
  if (key === "priority") return "Medium";
  if (key === "acknowledgementstatus") return "Pending";

  return "";
}

export function createBlankRecord(columns, collectionName, nextId) {
  return Object.fromEntries(
    columns.map((column) => {
      if (column === "id") return [column, nextId];
      return [column, defaultValueForColumn(column, collectionName)];
    })
  );
}
