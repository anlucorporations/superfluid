'use client';
// RNF-04 / RE-04: motor de sondeo serializado por cuenta con backoff adaptativo.
// Base 5 s (brief literal), timeout umbral 25 s (> p95 medida ≈20 s),
// degradación 15→30 s, recuperación tras 3 éxitos consecutivos.
// V2 (auditoría código): intervalo efectivo en ref (el encadenado de setTimeout ya no
// queda atrapado en closures obsoletos), refreshNow fiable con pending, epoch para
// descartar respuestas tardías y reset de datos al cambiar de cuenta.

import { useCallback, useEffect, useRef, useState } from 'react';
// Fase 4 (pruebas): la política de backoff y el control de solapamiento son funciones
// PURAS en lib/ui-logic.ts (testadas en node sin React). El hook sólo orquesta; el
// comportamiento observado es idéntico al original.
import {
  POLL_BASE_MS, POLL_CALL_TIMEOUT_MS, applyFailure, applySuccess, initialPollTiming,
  isDegraded, nextDelayMs, planTick, type PollTiming,
} from './ui-logic';

const BASE_MS = POLL_BASE_MS;
const CALL_TIMEOUT_MS = POLL_CALL_TIMEOUT_MS;

export interface PollState<T> {
  data: T | null;
  lastUpdated: number | null;
  degraded: boolean;
  intervalMs: number;
  error: string | null;
}

export function usePolledData<T>(
  fetcher: () => Promise<T>,
  enabled = true,
  resetKey?: string,
): PollState<T> & { refreshNow: () => void } {
  const [state, setState] = useState<PollState<T>>({
    data: null, lastUpdated: null, degraded: false, intervalMs: BASE_MS, error: null,
  });
  const inFlight = useRef(false); // RE-04a: nunca dos llamadas en vuelo
  const pendingRefresh = useRef(false);
  const timing = useRef<PollTiming>(initialPollTiming()); // successes/failures/intervalMs (puro)
  const epoch = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const tick = useCallback(async () => {
    if (!mounted.current) { pendingRefresh.current = true; return; }
    const plan = planTick(inFlight.current); // política pura anti-solapamiento
    if (!plan.run) { pendingRefresh.current = plan.pending; return; }
    inFlight.current = true;
    const myEpoch = epoch.current;
    try {
      const data = await withTimeout(fetcherRef.current(), CALL_TIMEOUT_MS);
      if (!mounted.current || myEpoch !== epoch.current) return;
      timing.current = applySuccess(timing.current);
      setState((s) => ({
        ...s, data, lastUpdated: Date.now(),
        degraded: isDegraded(timing.current), intervalMs: timing.current.intervalMs, error: null,
      }));
    } catch (e) {
      if (!mounted.current || myEpoch !== epoch.current) return;
      timing.current = applyFailure(timing.current);
      // conserva último dato conocido (UI "desactualizado hace Xs")
      setState((s) => ({
        ...s, degraded: true, intervalMs: timing.current.intervalMs, error: errorMessage(e),
      }));
    } finally {
      inFlight.current = false;
      if (mounted.current && enabledRef.current) {
        const wait = nextDelayMs(pendingRefresh.current, timing.current.intervalMs);
        pendingRefresh.current = false;
        timer.current = setTimeout(() => void tick(), wait);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    epoch.current += 1; // descarta respuestas de la suscripción anterior
    if (!enabled) {
      clearTimeout(timer.current);
      return;
    }
    // reset al cambiar de cuenta (resetKey): no mostrar datos ajenos
    timing.current = initialPollTiming();
    setState((s) => ({ ...s, data: null, lastUpdated: null, degraded: false, error: null, intervalMs: BASE_MS }));
    void tick();
    return () => {
      clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, resetKey, tick]);

  const refreshNow = useCallback(() => {
    clearTimeout(timer.current);
    pendingRefresh.current = true;
    void tick();
  }, [tick]);

  return { ...state, refreshNow };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('RPC_TIMEOUT')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function errorMessage(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  return msg === 'RPC_TIMEOUT' ? 'Tiempo de espera agotado contra el nodo RPC' : msg;
}
