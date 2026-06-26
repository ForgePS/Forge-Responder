import { normalizeAddressKey } from "./alertDashboard.js";

export function parseBusinessDirectoryCsv(text = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const rows = lines.slice(1);

  function col(name, fallbackIndex) {
    const index = header.indexOf(name);
    return index >= 0 ? index : fallbackIndex;
  }

  const addressIdx = col("address", 0);
  const nameIdx = col("business_name", col("businessname", col("name", 1)));
  const infoIdx = col("critical_info", col("criticalinfo", col("info", 2)));
  const latIdx = col("latitude", col("lat", 3));
  const lngIdx = col("longitude", col("lng", col("lon", 4)));

  return rows.map((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
    const address = cells[addressIdx] || "";
    return {
      id: `biz-${index + 1}-${Date.now().toString(36)}`,
      address,
      normalizedAddress: normalizeAddressKey(address),
      businessName: cells[nameIdx] || "",
      criticalInfo: cells[infoIdx] || "",
      latitude: cells[latIdx] ? Number(cells[latIdx]) : null,
      longitude: cells[lngIdx] ? Number(cells[lngIdx]) : null,
    };
  }).filter((entry) => entry.address);
}

export const BUSINESS_DIRECTORY_CSV_TEMPLATE = `address,business_name,critical_info,latitude,longitude
6530 Hise Parkway,Horn Lake Fire Station,Critical infrastructure notes,34.955,-90.042`;
