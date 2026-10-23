/**
 * Configurable preplan risk scoring (Phase 3 stub).
 * Tenants can later supply weights; defaults are conservative heuristics.
 */
export function calculatePreplanRiskScore(preplan = {}, factors = {}) {
  const weights = {
    highRise: 15,
    hazmat: 20,
    noSprinkler: 10,
    limitedAccess: 10,
    targetHazard: 25,
    vulnerablePopulation: 15,
    ...(factors.weights || {}),
  };

  let score = Number(factors.baseScore) || 20;
  const applied = [];

  if (factors.highRise || /high.?rise/i.test(String(preplan.preplanTypeId || ""))) {
    score += weights.highRise;
    applied.push("highRise");
  }
  if (factors.hazmat || (preplan.systemIds || []).length === 0 && factors.assumeHazmat) {
    if (factors.hazmat) {
      score += weights.hazmat;
      applied.push("hazmat");
    }
  }
  if (factors.noSprinkler) {
    score += weights.noSprinkler;
    applied.push("noSprinkler");
  }
  if (factors.limitedAccess) {
    score += weights.limitedAccess;
    applied.push("limitedAccess");
  }
  if (factors.targetHazard || preplan.priority === "target_hazard") {
    score += weights.targetHazard;
    applied.push("targetHazard");
  }
  if (factors.vulnerablePopulation) {
    score += weights.vulnerablePopulation;
    applied.push("vulnerablePopulation");
  }

  if (factors.manualOverrideLevel) {
    return {
      score,
      level: factors.manualOverrideLevel,
      factors: applied,
      overridden: true,
      overrideReason: factors.overrideReason || "",
    };
  }

  let level = "Low";
  if (score >= 80) level = "Target Hazard";
  else if (score >= 60) level = "Critical";
  else if (score >= 40) level = "High";
  else if (score >= 25) level = "Moderate";

  return { score, level, factors: applied, overridden: false, overrideReason: "" };
}
