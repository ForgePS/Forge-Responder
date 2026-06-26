export const APPARATUS_ADMIN_COLUMN_ORDER = [
  "id",
  "unit",
  "type",
  "station",
  "year",
  "status",
  "operator",
  "mileage",
  "engineHours",
  "pumpHours",
  "fuel",
  "pmDue",
  "checks",
];

export const ASSETS_ADMIN_COLUMN_ORDER = [
  "id",
  "name",
  "category",
  "serial",
  "location",
  "assigned",
  "inspection",
  "value",
  "status",
];

export const APPARATUS_ADMIN_HIDDEN_FIELDS = new Set(["checks"]);

export const FLEET_DROPDOWN_IDS = {
  "hlfd-rms-apparatus": {
    status: "apparatusStatus",
    station: "stations",
    unit: "apparatusUnits",
  },
  "hlfd-rms-assets": {
    category: "assetCategories",
    location: "stations",
    status: "assetStatuses",
  },
};

export function isApparatusCollection(collectionName = "") {
  return collectionName === "hlfd-rms-apparatus";
}

export function isAssetsCollection(collectionName = "") {
  return collectionName === "hlfd-rms-assets";
}

export function isFleetCollection(collectionName = "") {
  return isApparatusCollection(collectionName) || isAssetsCollection(collectionName);
}

export function getFleetDropdownId(collectionName = "", column = "") {
  return FLEET_DROPDOWN_IDS[collectionName]?.[column] || null;
}

export function orderFleetColumns(columns = [], collectionName = "") {
  const order = isApparatusCollection(collectionName)
    ? APPARATUS_ADMIN_COLUMN_ORDER
    : isAssetsCollection(collectionName)
      ? ASSETS_ADMIN_COLUMN_ORDER
      : [];
  const unique = Array.from(new Set(columns.filter(Boolean)));
  return [
    ...order.filter((column) => unique.includes(column)),
    ...unique.filter((column) => !order.includes(column)),
  ];
}
