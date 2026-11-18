// helpers/resultados.ts — FASE 3
// Escritura de resultados NDJSON a RepoPrueba/05_resultados/resultados_<YYYY-MM-DD>.ndjson
// Un objeto JSON por línea: {id, feature, escenario, wallet, plataforma, modo, estado, duracion_ms, captura, detalle}
// Estados: PASS | FAIL | BLOCKED | N/A | NOT_RUN (exactamente los cinco del enunciado).

import { appendFile, mkdir } from 'node:fs/promises';

export type Estado = 'PASS' | 'FAIL' | 'BLOCKED' | 'N/A' | 'NOT_RUN';

export interface Resultado {
  id: string;
  feature: string;
  escenario: string;
  wallet: string;
  plataforma: string;
  modo: string;
  estado: Estado;
  duracion_ms: number;
  captura: string | null;
  detalle: string;
}

export class RegistroNDJSON {
  private archivo: string;
  constructor(archivo: string) {
    this.archivo = archivo;
  }

  async abrir(): Promise<void> {
    await mkdir(this.archivo.substring(0, this.archivo.lastIndexOf('/')), { recursive: true });
  }

  /** Añade una línea NDJSON (append atómico por escritura única por registro). */
  async escribir(r: Resultado): Promise<void> {
    await appendFile(this.archivo, JSON.stringify(r) + '\n', 'utf8');
  }
}

/** Resumen por estado para el cierre de la ejecución (stdout, no NDJSON). */
export function resumen(registros: Resultado[]): Record<Estado, number> {
  const vacio = { PASS: 0, FAIL: 0, BLOCKED: 0, 'N/A': 0, NOT_RUN: 0 };
  return registros.reduce((acc, r) => ({ ...acc, [r.estado]: (acc[r.estado] ?? 0) + 1 }), vacio as Record<Estado, number>);
}
