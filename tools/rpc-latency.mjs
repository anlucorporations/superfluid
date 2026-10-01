// RNF-04: mide latencia del RPC Besu (percentiles n=200) y valida el presupuesto.
// Uso: node tools/rpc-latency.mjs [n]  → exit 0 si p90<5s, p95<20s, ≥95% válidas.
const RPC = process.env.RPC_URL ?? 'https://besu.alumnos.codecrypto.academy';
const N = Number(process.argv[2] ?? 200);
const t0 = Date.now();
const samples = [];
let valid = 0;
for (let i = 0; i < N; i++) {
  const s = Date.now();
  try {
    const res = await fetch(RPC, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: i, method: 'eth_blockNumber', params: [] }),
      signal: AbortSignal.timeout(30_000),
    });
    const j = await res.json();
    if (!j.error) { valid++; samples.push(Date.now() - s); }
  } catch { /* timeout/error cuenta como inválida */ }
}
samples.sort((a, b) => a - b);
const pct = (p) => samples[Math.min(samples.length - 1, Math.floor(p * samples.length))];
const rate = valid / N;
console.log(JSON.stringify({ n: N, valid, successRate: +rate.toFixed(3),
  p50: pct(0.5), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99), elapsedMs: Date.now() - t0 }));
const ok = rate >= 0.95 && pct(0.9) < 5000 && pct(0.95) < 20000;
console.log(ok ? 'RNF-04 OK' : 'RNF-04 FAIL (presupuesto percentiles)');
process.exit(ok ? 0 : 1);
