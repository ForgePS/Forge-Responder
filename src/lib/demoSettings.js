// What the shared demo account may write to departments/forge-demo/settings/main on a reseed.
// No imports, so the rules tests can check it against firestore.rules.

/**
 * Fields only platform creators may change (firestore.rules, settings/{document}):
 * - `subscription`: the demo's default dates change daily, so writing it blocked every
 *   demo login after the first day.
 * - `enabledModules` / `disabledModules`: the demo's enabledModules follows
 *   ADMIN_MODULE_OPTIONS, so adding a module (EMS Management) blocked every demo login once
 *   a reseed was due. The app takes modules from the server entitlements and
 *   disabledModules, not from this field.
 */
export const DEMO_SETTINGS_CREATOR_ONLY_FIELDS = ["subscription", "enabledModules", "disabledModules"];

export function demoSettingsForWrite(settings = {}) {
  return Object.fromEntries(Object.entries(settings)
    .filter(([key]) => !DEMO_SETTINGS_CREATOR_ONLY_FIELDS.includes(key)));
}
