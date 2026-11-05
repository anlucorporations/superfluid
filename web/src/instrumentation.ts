/**
 * H6 — Scheduler de jobs internos (reconciliación, espejo de eventos, GDPR).
 * Next ejecuta `register()` una vez por proceso Node. Los jobs se pueden
 * desactivar con `DISABLE_JOBS=1` y también a mano desde `/admin/jobs`.
 */

const INTERVAL_MS = 5 * 60 * 1000;
const PERIOD: Record<string, number> = {
  reconcile_flows: INTERVAL_MS,
  flows_history: 15 * 60 * 1000,
  anonymize_pii: 24 * 3_600_000,
  mark_scheduled_due: INTERVAL_MS,
};

const lastRun: Record<string, number> = {};
let started = false;

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_JOBS === "1") return;
  if (started) return;
  started = true;

  async function tick() {
    const { runJob } = await import("./lib/jobs/reconciler");
    for (const job of Object.keys(PERIOD)) {
      const due = !lastRun[job] || Date.now() - lastRun[job] >= PERIOD[job];
      if (!due) continue;
      lastRun[job] = Date.now();
      try {
        const output = await runJob(job as never, "cron");
        console.log(`[jobs] ${job} → ${JSON.stringify(output.result)}`);
      } catch (error) {
        console.error(`[jobs] ${job} falló:`, (error as Error).message ?? error);
      }
    }
  }

  // Pequeño aplazamiento para no competir con el arranque del servidor.
  setTimeout(() => {
    void tick();
  }, 20_000);
  const interval = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
  if (typeof interval === "object" && interval && "unref" in interval) {
    interval.unref();
  }
}
