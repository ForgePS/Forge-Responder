/**
 * Small per-instance result cache. Keys always start with the department id
 * and include the department's data version and the caller's district scope,
 * so one tenant (or one restricted user) can never be served another's result,
 * and any data change invalidates old entries automatically.
 */
const crypto = require("node:crypto");

const MAX_ENTRIES = 300;
const TTL_MS = 5 * 60 * 1000;

function createCache({ maxEntries = MAX_ENTRIES, ttlMs = TTL_MS, now = () => Date.now() } = {}) {
  const store = new Map();

  function key(departmentId, version, scope, payload) {
    if (!departmentId) throw new Error("Cache keys need a department id.");
    const scopeKey = scope.allDistricts ? "all" : `d:${[...(scope.districtIds || [])].sort().join(",")}`;
    const digest = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24);
    return `${departmentId}|v${version}|${scopeKey}|${digest}`;
  }

  function get(k) {
    const hit = store.get(k);
    if (!hit) return undefined;
    if (now() - hit.at > ttlMs) {
      store.delete(k);
      return undefined;
    }
    store.delete(k);
    store.set(k, hit); // refresh LRU position
    return hit.value;
  }

  function set(k, value) {
    store.set(k, { value, at: now() });
    while (store.size > maxEntries) store.delete(store.keys().next().value);
    return value;
  }

  function clearDepartment(departmentId) {
    for (const k of [...store.keys()]) if (k.startsWith(`${departmentId}|`)) store.delete(k);
  }

  return { key, get, set, clearDepartment, size: () => store.size, keys: () => [...store.keys()] };
}

module.exports = { createCache };
