/**
 * Helpers for the EMS Medications screens: lots on hand by expiration, and lots
 * totalled across locations for recalls and holds.
 */
import { expirationStatus, locationPath, todayIso } from "./inventoryDisplay.js";

/** Lot numbers compare without case, spaces or dashes, like the server (functions/lib/emsInventory/logic.js). */
export function sameLot(a = "", b = "") {
  const clean = (v) => String(v || "").toUpperCase().replace(/[\s-]/g, "");
  return Boolean(clean(a)) && clean(a) === clean(b);
}

/** Every medication lot on hand, soonest expiration first, by the department's warning windows. */
export function expiringLots({ items = [], balances = [], locations = [], warningDays, today = todayIso() }) {
  const itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
  const locationsById = Object.fromEntries(locations.map((l) => [l.id, l]));
  const rows = [];
  for (const balance of balances) {
    const item = itemsById[balance.itemId];
    if (!item) continue;
    for (const lot of balance.lots || []) {
      if (!(lot.quantity > 0)) continue;
      const status = expirationStatus(lot.expiration, warningDays, today);
      rows.push({
        id: `${balance.id}:${lot.key}`, item, balance, lot, status,
        location: locationsById[balance.locationId] || { id: balance.locationId, name: "(removed location)" },
        path: locationPath(locationsById[balance.locationId], locationsById) || "(removed location)",
      });
    }
  }
  return rows.sort((a, b) => String(a.lot.expiration || "9999").localeCompare(String(b.lot.expiration || "9999"))
    || a.item.name.localeCompare(b.item.name) || a.path.localeCompare(b.path));
}

/** Lots of these items on hand, by item and lot key: { item, key, lot, expiration, held, onHand, places: [{ locationId, quantity }] }. */
export function lotsOnHand(balances = [], itemsById = {}) {
  const lots = new Map();
  for (const balance of balances) {
    const item = itemsById[balance.itemId];
    if (!item) continue;
    for (const lot of balance.lots || []) {
      if (!(lot.quantity > 0)) continue;
      const id = `${balance.itemId}__${lot.key}`;
      const entry = lots.get(id) || { id, item, key: lot.key, lot: lot.lot || "", expiration: lot.expiration || "", held: false, onHand: 0, places: [] };
      entry.onHand += lot.quantity;
      entry.held = entry.held || Boolean(lot.held);
      entry.places.push({ locationId: balance.locationId, quantity: lot.quantity });
      lots.set(id, entry);
    }
  }
  return [...lots.values()];
}
