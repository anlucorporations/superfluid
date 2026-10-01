import { describe, expect, it, vi } from 'vitest';
import {
  POLL_BACKOFF_STEPS, POLL_BASE_MS, POLL_RECOVERY_SUCCESSES,
  applyFailure, applySuccess, backoffIntervalMs, initialPollTiming, isDegraded,
  nextDelayMs, planTick,
} from '../ui-logic';

// RNF-04 / RE-04: motor de backoff del sondeo (lógica pura extraída de lib/polling.ts).
// Test de integración SIN DOM: se ejercita la política de intervalo y el control de
// solapamiento tal y como los consume el hook usePolledData.

describe('backoff de intervalo (successes/failures → intervalMs)', () => {
  it('estado inicial = 5 s (base del brief)', () => {
    expect(initialPollTiming()).toEqual({ successes: 0, failures: 0, intervalMs: POLL_BASE_MS });
    expect(POLL_BASE_MS).toBe(5_000);
    expect(POLL_BACKOFF_STEPS).toEqual([15_000, 30_000]);
  });

  it('1 fallo → 15 s, 2 fallos → 30 s, techo 30 s en adelante', () => {
    let t = initialPollTiming();
    t = applyFailure(t);
    expect(t.intervalMs).toBe(15_000);
    expect(t.failures).toBe(1);
    expect(isDegraded(t)).toBe(true);
    t = applyFailure(t);
    expect(t.intervalMs).toBe(30_000);
    t = applyFailure(t);
    expect(t.intervalMs).toBe(30_000);
    expect(t.failures).toBe(3);
    expect(backoffIntervalMs(99)).toBe(30_000);
  });

  it('3 éxitos consecutivos tras un fallo → vuelve a 5 s', () => {
    let t = applyFailure(initialPollTiming());
    expect(t.intervalMs).toBe(15_000);
    t = applySuccess(t); // éxito 1
    expect(t.intervalMs).toBe(15_000);
    expect(isDegraded(t)).toBe(true);
    t = applySuccess(t); // éxito 2
    expect(t.intervalMs).toBe(15_000);
    t = applySuccess(t); // éxito 3 → recuperación
    expect(t).toEqual({ successes: 3, failures: 0, intervalMs: 5_000 });
    expect(isDegraded(t)).toBe(false);
    expect(POLL_RECOVERY_SUCCESSES).toBe(3);
  });

  it('un éxito interrumpe la racha: 2 fallos → éxito → fallo vuelve a 15 s', () => {
    let t = applyFailure(initialPollTiming());
    t = applyFailure(t);
    expect(t.intervalMs).toBe(30_000);
    t = applySuccess(t);            // successes=1, failures=2 → sigue en 30 s
    expect(t.intervalMs).toBe(30_000);
    t = applyFailure(t);            // la racha de éxitos se reinicia en 0
    expect(t).toEqual({ successes: 0, failures: 3, intervalMs: 30_000 });
  });

  it('sin fallos previos, los éxitos mantienen 5 s', () => {
    let t = initialPollTiming();
    for (let i = 0; i < 10; i++) t = applySuccess(t);
    expect(t).toEqual({ successes: 10, failures: 0, intervalMs: 5_000 });
  });
});

describe('anti-solapamiento RE-04a (nunca dos llamadas RPC en vuelo)', () => {
  it('sin vuelo → ejecutar; con vuelo → encolar pending', () => {
    expect(planTick(false)).toEqual({ run: true, pending: false });
    expect(planTick(true)).toEqual({ run: false, pending: true });
  });

  it('refresh encolada dispara de inmediato (0 ms); si no, respeta el intervalo', () => {
    expect(nextDelayMs(true, 15_000)).toBe(0);
    expect(nextDelayMs(false, 15_000)).toBe(15_000);
    expect(nextDelayMs(false, 5_000)).toBe(5_000);
  });

  it('integración: máquina de estados del tick con fetcher falso y timers simulados', { timeout: 30_000 }, async () => {
    vi.useFakeTimers();
    try {
      // Réplica fiel del encadenado del hook (inFlight + pending + intervalMs puro).
      const clock = { inFlight: false, pending: false, timing: initialPollTiming() };
      let calls = 0;
      let failing = true;
      const fetcher = vi.fn(async () => {
        calls += 1;
        if (failing) throw new Error('boom-rpc');
        return { ok: true };
      });
      const tick = async () => {
        const plan = planTick(clock.inFlight);
        if (!plan.run) { clock.pending = plan.pending; return; }
        clock.inFlight = true;
        try {
          await fetcher();
          clock.timing = applySuccess(clock.timing);
        } catch {
          clock.timing = applyFailure(clock.timing);
        } finally {
          clock.inFlight = false;
          const wait = nextDelayMs(clock.pending, clock.timing.intervalMs);
          clock.pending = false;
          setTimeout(() => void tick(), wait);
        }
      };

      void tick();                       // disparo inicial (falla)
      await vi.advanceTimersByTimeAsync(0);
      expect(clock.timing.intervalMs).toBe(15_000);

      await vi.advanceTimersByTimeAsync(14_000);
      expect(calls).toBe(1);             // aún no ha vuelto a sondear a los 14 s
      await vi.advanceTimersByTimeAsync(1_000);
      expect(calls).toBe(2);             // segundo sondeo a los 15 s
      expect(clock.timing.intervalMs).toBe(30_000); // 2 fallos → 30 s

      failing = false;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(calls).toBe(3);
      expect(clock.timing.intervalMs).toBe(30_000); // éxito 1 de 3
      await vi.advanceTimersByTimeAsync(30_000);
      expect(clock.timing.intervalMs).toBe(30_000); // éxito 2 de 3
      await vi.advanceTimersByTimeAsync(30_000);
      expect(clock.timing.intervalMs).toBe(5_000);  // éxito 3 → recuperación

      // anti-solapamiento: refreshNow mientras hay una llamada en vuelo → pending, no 2ª en vuelo
      let inFlightSeen = 0;
      const slow = { inFlight: false, pending: false };
      const runSlow = async () => {
        const plan = planTick(slow.inFlight);
        if (!plan.run) { slow.pending = plan.pending; inFlightSeen += 1; return; }
        slow.inFlight = true;
        await new Promise((r) => setTimeout(r, 8_000));
        slow.inFlight = false;
      };
      const p = runSlow();
      await vi.advanceTimersByTimeAsync(0); // arranca el vuelo (inFlight = true)
      expect(slow.inFlight).toBe(true);
      await runSlow();
      await runSlow();
      await vi.advanceTimersByTimeAsync(8_000); // termina el vuelo lento
      await p;
      expect(inFlightSeen).toBe(2);
      expect(slow.pending).toBe(true);
      expect(nextDelayMs(slow.pending, 15_000)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
