/**
 * Bring a department's saved dropdown up to date with newer default options
 * (pure, unit tested). Adds default options it has never had (matched by id or
 * by label, so a department's own "EMT" isn't duplicated) and applies renames
 * of default labels the department hasn't changed. Nothing is removed, and
 * options the department switched off stay off.
 *
 * Returns the options to save, or null when nothing changes.
 */
export function upgradeDropdownOptions(record = {}, defaults = {}, renames = []) {
  const current = Array.isArray(record.options) ? record.options : [];
  const key = (value) => String(value || "").trim().toLowerCase();
  let changed = false;

  let options = current.map((option) => {
    const rename = renames.find(([dropdownId, optionId, oldLabel]) => (
      dropdownId === record.id && option.id === optionId && option.label === oldLabel
    ));
    if (!rename) return option;
    const taken = current.some((other) => other !== option && key(other.label) === key(rename[3]));
    if (taken) return option;
    changed = true;
    return { ...option, label: rename[3] };
  });

  const ids = new Set(options.map((option) => option.id));
  const labels = new Set(options.map((option) => key(option.label)));
  let nextOrder = Math.max(0, ...options.map((option) => Number(option.sortOrder) || 0));
  (defaults.options || []).forEach((option) => {
    if (ids.has(option.id) || labels.has(key(option.label))) return;
    nextOrder += 1;
    options = [...options, { ...option, sortOrder: nextOrder }];
    ids.add(option.id);
    labels.add(key(option.label));
    changed = true;
  });

  return changed ? options : null;
}
