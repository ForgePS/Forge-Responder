/**
 * The public demo department. Its sign-in is published on the /demo page, so
 * nothing done there may reach real people: email and texts are logged, not sent.
 */
const DEMO_DEPARTMENT_ID = "forge-demo";

function isDemoDepartment(departmentId) {
  return String(departmentId || "").trim() === DEMO_DEPARTMENT_ID;
}

function logDemoOutbound(kind, details = {}) {
  console.log(`[demo: ${kind} not sent]`, JSON.stringify(details).slice(0, 1000));
}

const DEMO_OUTBOUND_MESSAGE = "This is the demo department, so nothing was actually sent.";

module.exports = {
  DEMO_DEPARTMENT_ID,
  DEMO_OUTBOUND_MESSAGE,
  isDemoDepartment,
  logDemoOutbound,
};
