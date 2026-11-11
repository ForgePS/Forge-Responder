/**
 * Forge's own NERIS validation rules, run server-side. The rules are not
 * rewritten here: generated/nerisValidation.cjs is a bundle of
 * src/lib/neris/validation.js (scripts/build-forge-ai-neris-rules.mjs), and
 * tests/unit/forgeAiNerisRules.test.mjs fails if it drifts from src/.
 */
const rules = require("./generated/nerisValidation.cjs");

/** @returns {{issues:object[], blocking:number, warnings:number, completion:number}} */
function checkReport(report) {
  let issues = [];
  try {
    issues = rules.validateNerisReport(report || {});
  } catch (error) {
    console.error("forge ai: NERIS rules failed on a report", error?.message);
    issues = [];
  }
  let completion = 0;
  try {
    completion = rules.computeCompletionPercentage(report || {});
  } catch {
    completion = 0;
  }
  return {
    issues,
    blocking: rules.countBlockingErrors(issues),
    warnings: issues.filter((i) => i.severity === "warning").length,
    completion,
  };
}

module.exports = { checkReport };
