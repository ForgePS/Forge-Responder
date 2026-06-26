/**
 * NERIS advanced incident documentation feature flags.
 * Department settings may override defaults via settings.nerisFeatures.
 */

export const DEFAULT_NERIS_FEATURES = {
  nerisAdvancedValidation: true,
  incidentAutoPopulation: true,
  aiNarrativeBuilder: true,
  offlineIncidentReports: true,
  officerApprovalWorkflow: true,
  enhancedEmsModule: true,
  irwinWildlandIntegration: false,
  nfpa1710Analytics: true,
  nfpaAnnualSurvey: true,
  incidentHeatMapping: true,
  adHocIncidentReporting: true,
};

/**
 * @param {Record<string, unknown> | null | undefined} settings
 */
export function resolveNerisFeatures(settings) {
  const overrides = settings?.nerisFeatures || {};
  return { ...DEFAULT_NERIS_FEATURES, ...overrides };
}

/**
 * @param {Record<string, unknown> | null | undefined} settings
 * @param {keyof typeof DEFAULT_NERIS_FEATURES} flag
 */
export function isNerisFeatureEnabled(settings, flag) {
  return Boolean(resolveNerisFeatures(settings)[flag]);
}
