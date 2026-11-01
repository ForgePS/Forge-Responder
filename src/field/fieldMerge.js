/**
 * Conflict rules for records edited on a device while someone else may have
 * edited the same record on the server (pure functions, unit tested).
 *
 * Three-way merge per field: `base` is the server copy the crew started from,
 * `mine` is what they saved on the device, `server` is the copy now on the
 * server. For each field the crew changed:
 *  - server still equals base  -> take mine
 *  - server already equals mine -> nothing to do
 *  - otherwise                  -> conflict (both sides changed it)
 * Fields the crew didn't touch always keep the server value.
 */

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function sameValue(a, b) {
  const blank = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  if (blank(a) && blank(b)) return true;
  return stable(a) === stable(b);
}

export function getPath(object, path) {
  return String(path).split(".").reduce((value, key) => (value == null ? undefined : value[key]), object);
}

export function setPath(object, path, value) {
  const keys = String(path).split(".");
  const root = { ...(object || {}) };
  let cursor = root;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
      return;
    }
    cursor[key] = cursor[key] && typeof cursor[key] === "object" && !Array.isArray(cursor[key])
      ? { ...cursor[key] }
      : {};
    cursor = cursor[key];
  });
  return root;
}

/**
 * @param {object|null} base   server copy when editing started (null = new record)
 * @param {object} mine        device copy
 * @param {object|null} server server copy now (null = not on the server)
 * @param {string[]} paths     fields the field app edits (dot paths)
 * @returns {{ merged: object, conflicts: {path:string, mine:any, server:any, base:any}[], changed: boolean }}
 */
export function threeWayMerge(base, mine, server, paths = []) {
  if (!server) return { merged: { ...mine }, conflicts: [], changed: true };
  let merged = { ...server };
  const conflicts = [];
  let changed = false;
  for (const path of paths) {
    const mineValue = getPath(mine, path);
    const baseValue = base ? getPath(base, path) : undefined;
    const serverValue = getPath(server, path);
    if (sameValue(mineValue, baseValue)) continue; // crew didn't change it
    if (sameValue(serverValue, mineValue)) continue; // already the same
    if (base && sameValue(serverValue, baseValue)) {
      merged = setPath(merged, path, mineValue);
      changed = true;
      continue;
    }
    if (!base && (serverValue === undefined || serverValue === null || serverValue === "")) {
      merged = setPath(merged, path, mineValue);
      changed = true;
      continue;
    }
    conflicts.push({ path, mine: mineValue, server: serverValue, base: baseValue });
  }
  return { merged, conflicts, changed };
}

/**
 * Apply the crew's choices for conflicting fields.
 * @param {object} merged result of threeWayMerge
 * @param {{path:string, mine:any, server:any}[]} conflicts
 * @param {Record<string, "mine"|"server"|"both">} choices
 */
export function resolveConflicts(merged, conflicts = [], choices = {}) {
  let next = { ...merged };
  for (const conflict of conflicts) {
    const choice = choices[conflict.path] || "mine";
    if (choice === "server") {
      next = setPath(next, conflict.path, conflict.server);
    } else if (choice === "both" && typeof conflict.mine === "string" && typeof conflict.server === "string") {
      next = setPath(next, conflict.path, `${conflict.server.trim()}\n\n${conflict.mine.trim()}`.trim());
    } else if (choice === "both" && Array.isArray(conflict.mine) && Array.isArray(conflict.server)) {
      next = setPath(next, conflict.path, [...new Set([...conflict.server, ...conflict.mine])]);
    } else {
      next = setPath(next, conflict.path, conflict.mine);
    }
  }
  return next;
}

/** True when a field-dated change is newer than (or same day as) what the server holds. */
export function isSameOrNewerDate(mine = "", server = "") {
  if (!server) return true;
  if (!mine) return false;
  return String(mine) >= String(server);
}
