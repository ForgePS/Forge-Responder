import { listFleetAssets } from "./fleetAssetService.js";
import { listDefects } from "./fleetDefectService.js";
import { listFleetWorkOrders } from "./fleetWorkOrderService.js";
import { listCostEntries } from "./fleetCostReplacementService.js";
import { listFuelTransactions } from "./fleetFuelService.js";
import { listReplacementCases } from "./fleetCostReplacementService.js";
import { getAppCheckStatus } from "../firebaseClient.js";

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

/**
 * Client-side load smoke: parallel fleet reads timed for hardening evidence.
 * Not a substitute for dedicated k6/Artillery soak tests.
 *
 * @param {string} departmentId
 * @param {{ concurrency?: number, rounds?: number }} [options]
 */
export async function runFleetLoadSmoke(departmentId, options = {}) {
  const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 4, 12));
  const rounds = Math.max(1, Math.min(Number(options.rounds) || 3, 10));
  const startedAt = new Date().toISOString();
  const samples = [];

  const tasks = [
    { id: "assets", run: () => listFleetAssets(departmentId) },
    { id: "defects", run: () => listDefects(departmentId).catch(() => []) },
    { id: "workOrders", run: () => listFleetWorkOrders(departmentId).catch(() => []) },
    { id: "costs", run: () => listCostEntries(departmentId).catch(() => []) },
    { id: "fuel", run: () => listFuelTransactions(departmentId).catch(() => []) },
    { id: "replacement", run: () => listReplacementCases(departmentId).catch(() => []) },
  ];

  for (let round = 1; round <= rounds; round += 1) {
    const batch = [];
    for (let i = 0; i < concurrency; i += 1) {
      const task = tasks[i % tasks.length];
      const t0 = nowMs();
      batch.push(
        Promise.resolve()
          .then(() => task.run())
          .then((rows) => {
            const ms = Number((nowMs() - t0).toFixed(1));
            samples.push({
              round,
              task: task.id,
              ms,
              rows: Array.isArray(rows) ? rows.length : 0,
              ok: true,
            });
            return ms;
          })
          .catch((error) => {
            const ms = Number((nowMs() - t0).toFixed(1));
            samples.push({
              round,
              task: task.id,
              ms,
              rows: 0,
              ok: false,
              error: error?.message || "failed",
            });
            return ms;
          })
      );
    }
    await Promise.all(batch);
  }

  const okSamples = samples.filter((row) => row.ok);
  const times = okSamples.map((row) => row.ms).sort((a, b) => a - b);
  const sum = times.reduce((acc, n) => acc + n, 0);
  const p95 = times.length ? times[Math.min(times.length - 1, Math.floor(times.length * 0.95))] : 0;

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    departmentId,
    concurrency,
    rounds,
    sampleCount: samples.length,
    successCount: okSamples.length,
    failureCount: samples.length - okSamples.length,
    avgMs: times.length ? Number((sum / times.length).toFixed(1)) : 0,
    minMs: times[0] || 0,
    maxMs: times[times.length - 1] || 0,
    p95Ms: p95,
    pass: samples.every((row) => row.ok) && (p95 === 0 || p95 < 8000),
    appCheck: getAppCheckStatus(),
    samples,
  };
}
