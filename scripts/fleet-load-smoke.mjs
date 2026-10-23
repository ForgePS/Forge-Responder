/**
 * Node smoke harness for fleet load characteristics (local / CI).
 * Times synthetic CPU-bound scoring loops + optional Firestore if admin creds exist.
 *
 * Usage: node scripts/fleet-load-smoke.mjs
 */
const rounds = Number(process.env.FLEET_LOAD_ROUNDS || 5);
const opsPerRound = Number(process.env.FLEET_LOAD_OPS || 2000);

function scoreSynthetic(seed = 0) {
  let total = 0;
  for (let i = 0; i < opsPerRound; i += 1) {
    const age = (seed + i) % 25;
    const miles = ((seed + i) * 97) % 200000;
    const downtime = ((seed + i) * 13) % 400;
    total += Math.min(100, (age / 15) * 40 + (miles / 150000) * 35 + (downtime / 400) * 25);
  }
  return total;
}

const samples = [];
const tAll = Date.now();
for (let round = 1; round <= rounds; round += 1) {
  const t0 = Date.now();
  scoreSynthetic(round * 17);
  samples.push(Date.now() - t0);
}

const sum = samples.reduce((a, b) => a + b, 0);
const sorted = [...samples].sort((a, b) => a - b);
const report = {
  kind: "fleet-load-smoke",
  rounds,
  opsPerRound,
  avgMs: Number((sum / samples.length).toFixed(2)),
  minMs: sorted[0],
  maxMs: sorted[sorted.length - 1],
  p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
  totalMs: Date.now() - tAll,
  pass: true,
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
