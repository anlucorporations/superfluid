import { describe, expect, it } from 'vitest';
import {
  ADDR_RE, PAGE_SIZE, formatEur, humanizeError, parseEur, validateReceiver, paginate,
} from '../ui-logic';

const E = 10n ** 18n; // 1 EURx en wei (18 decimales)
const CONTRACTS = {
  EUR: '0x36C02dA8a0983159322a80FFE9F24b1acfF8B570',
  EURx: '0x7046717d32AfcA450DC5D6e75724D4282DFAd16E',
};
const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// ---------------------------------------------------------------- CU-01/RF-01 formatEur
describe('formatEur', () => {
  it('positivos: enteros sin decimales', () => {
    expect(formatEur(0n)).toBe('0');
    expect(formatEur(1n * E)).toBe('1');
    expect(formatEur(5n * E)).toBe('5');
    expect(formatEur(99_999n * E)).toBe('99999');
  });

  it('positivos: fracciones con ceros trailing recortados', () => {
    expect(formatEur(E / 2n)).toBe('0.5');
    expect(formatEur(E / 4n)).toBe('0.25');
    expect(formatEur(1n * E + 10n ** 15n)).toBe('1.001');
  });

  it('truncado (no redondeo) a 6 decimales', () => {
    // 1.234567890123 EURx → 1.234567 (trunca, nunca redondea arriba)
    expect(formatEur(E + 234_567_890_123_000_000n)).toBe('1.234567');
    expect(formatEur(E + 999_999_999_999_999_999n)).toBe('1.999999');
    // 1 wei → 0.000000: se muestran 6 ceros (no se redondea a 1)
    expect(formatEur(1n)).toBe('0.000000');
    expect(formatEur(999_999n)).toBe('0.000000');
    expect(formatEur(1_000_000_000_000n)).toBe('0.000001');
  });

  it('negativos con signo menos y mismo truncado', () => {
    expect(formatEur(-1n * E)).toBe('-1');
    expect(formatEur(-(E + 234_567_890_123_000_000n))).toBe('-1.234567');
    expect(formatEur(-E / 2n)).toBe('-0.5');
    expect(formatEur(-(E / 1_000_000n))).toBe('-0.000001');
    // rate net típico de un stream de 2000 EUR/mes
    expect(formatEur(-771_604_938_271_604n)).toBe('-0.000771');
  });

  it('valores borde de 18 decimales y cero negativo', () => {
    expect(formatEur(999_999_999_999_999_999n)).toBe('0.999999');
    expect(formatEur(-0n)).toBe('0');
    expect(formatEur(10n ** 24n)).toBe('1000000');
  });
});

// ---------------------------------------------------------------- CU-01/02 parseEur
describe('parseEur', () => {
  it('enteros → wei con 18 decimales', () => {
    expect(parseEur('5')).toBe(5n * E);
    expect(parseEur(' 100 ')).toBe(100n * E);
    expect(() => parseEur('1.')).toThrow(/inválida/); // FIX P4-D2: formato estricto ^\d+(\.\d+)?$
  });

  it('decimales exactos', () => {
    expect(parseEur('1.5')).toBe(E + E / 2n);
    expect(parseEur('0.001')).toBe(10n ** 15n);
    expect(parseEur('2.777777777777777777')).toBe(2n * E + 777_777_777_777_777_777n);
  });

  it('más de 18 decimales: trunca sin desbordar', () => {
    expect(parseEur('1.000000000000000000999')).toBe(E);
    expect(parseEur('0.12345678901234567890123')).toBe(123_456_789_012_345_678n);
  });

  it('cero y sub-wei: 0 → error explícito', () => {
    expect(() => parseEur('0')).toThrow(/mayor que 0/);
    expect(() => parseEur('0.0')).toThrow(/mayor que 0/);
    expect(() => parseEur('0.000')).toThrow(/mayor que 0/);
    expect(() => parseEur('')).toThrow(/inválida/);
    // FIX P4-D2: sub-wei ahora es error explícito (antes se truncaba a 0n en silencio)
    expect(() => parseEur('0.0000000000000000001')).toThrow(/mayor que 0/);
  });

  it('entradas inválidas → Error "cantidad inválida"', () => {
    for (const bad of ['abc', '-5', '5e3', '1,5', '.5', '12 34', '0x10', 'NaN', '1.5x', ' ', '']) {
      expect(() => parseEur(bad), `parseEur(${JSON.stringify(bad)})`).toThrow(/inválida/);
    }
    // FIX P4-D2: multi-punto ya no se descarta en silencio — es inválido
    expect(() => parseEur('1.2.3')).toThrow(/inválida/);
  });
});

// ---------------------------------------------------------------- CU-03/D15 validateReceiver
describe('validateReceiver', () => {
  const R1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

  it('dirección EOA válida → null (sin error)', () => {
    expect(validateReceiver(R1, ACCOUNT, CONTRACTS)).toBeNull();
    expect(validateReceiver(R1.toLowerCase(), ACCOUNT, CONTRACTS)).toBeNull();
  });

  it('sin cuenta conectada: no puede clasificar como self', () => {
    expect(validateReceiver(R1, null, CONTRACTS)).toBeNull();
    expect(validateReceiver(ACCOUNT, null, CONTRACTS)).toBeNull();
  });

  it('destino propio → mensaje UI', () => {
    expect(validateReceiver(ACCOUNT, ACCOUNT, CONTRACTS)).toBe('El destino no puede ser tu propia cuenta.');
    expect(validateReceiver(ACCOUNT.toLowerCase(), ACCOUNT.toUpperCase(), CONTRACTS))
      .toBe('El destino no puede ser tu propia cuenta.');
  });

  it('contratos del sistema (EURx y EUR) → mensaje UI', () => {
    expect(validateReceiver(CONTRACTS.EURx, ACCOUNT, CONTRACTS)).toBe('El destino no puede ser un contrato del sistema.');
    expect(validateReceiver(CONTRACTS.EUR, ACCOUNT, CONTRACTS)).toBe('El destino no puede ser un contrato del sistema.');
    expect(validateReceiver(CONTRACTS.EURx.toLowerCase(), ACCOUNT, CONTRACTS)).toBe('El destino no puede ser un contrato del sistema.');
  });

  it('malformed: vacío, prefijo corto, hex inválido, sin 0x, con espacio interior', () => {
    const bad = ['', '0x', '70997970C51812dc3A010C7d01b50e0d17dc79C8', '0z70997970C51812dc3A010C7d01b50e0d17dc79C8',
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8GG', '0x 70997970C51812dc3A010C7d01b50e0d17dc79C8'];
    for (const a of bad) expect(validateReceiver(a, ACCOUNT, CONTRACTS), `validateReceiver(${a})`).toBe('Dirección Ethereum inválida.');
  });

  it('expresión regular de direcciones: acepta mayúsculas y minúsculas, rechaza longitudes raras', () => {
    expect(ADDR_RE.test('0x' + 'a'.repeat(40))).toBe(true);
    expect(ADDR_RE.test('0x' + 'A'.repeat(40))).toBe(true);
    expect(ADDR_RE.test('0x' + 'a'.repeat(39))).toBe(false);
    expect(ADDR_RE.test('0x' + 'a'.repeat(41))).toBe(false);
  });
});

// ---------------------------------------------------------------- D7 humanizeError
describe('humanizeError', () => {
  it('mapea reverts de contrato conocidos', () => {
    expect(humanizeError(new Error('execution reverted: EuroX: flow exists'))).toBe('Ya existe un flujo hacia esa dirección.');
    expect(humanizeError({ reason: 'EuroX: self flow' })).toBe('El destino no puede ser tu propia cuenta.');
    expect(humanizeError({ reason: 'EuroX: locked by deposits' })).toContain('bloqueados como depósito');
    expect(humanizeError({ reason: 'EuroX: insufficient free balance' })).toContain('Saldo libre insuficiente');
    expect(humanizeError({ reason: 'EuroX: invalid destination' })).toContain('Destino inválido');
    expect(humanizeError({ reason: 'EuroX: already paused or missing' })).toContain('ya está pausado');
    expect(humanizeError({ reason: 'EuroX: not paused' })).toBe('El flujo no está pausado.');
    expect(humanizeError({ reason: 'EUR: insufficient balance' })).toBe('No tienes EUR suficientes para envolver.');
    expect(humanizeError({ reason: 'EuroX: nothing to claim' })).toBe('No hay devengo pendiente por reclamar.');
    expect(humanizeError({ message: 'NETWORK_MISMATCH: la wallet está en otra red' })).toContain('otra red');
    expect(humanizeError(new Error('NO_WALLET: conecta MetaMask para firmar'))).toContain('modo solo lectura');
  });

  it('cubre la firma nested de MetaMask (error.message) y el code 4001', () => {
    expect(humanizeError({ error: { message: 'EuroX: rate must be positive' } })).toBe('La tasa del flujo debe ser positiva.');
    expect(humanizeError({ code: 4001, message: 'user rejected' })).toBe('Firma cancelada.');
    expect(humanizeError(new Error('MetaMask: User rejected the transaction'))).toBe('Firma cancelada.');
  });

  it('desconocidos: devuelve el texto original o "Error desconocido"', () => {
    expect(humanizeError(new Error('boom raro'))).toBe('boom raro');
    expect(humanizeError(undefined)).toBe('Error desconocido');
    expect(humanizeError(null)).toBe('Error desconocido');
    expect(humanizeError({})).toBe('Error desconocido');
    // FIX P4-D3: un string suelto se devuelve tal cual (antes 'Error desconocido')
    expect(humanizeError('cadena suelta')).toBe('cadena suelta');
    expect(humanizeError({ message: 'boom' })).toBe('boom');
    expect(humanizeError(0)).toBe('Error desconocido');
  });
});

// ---------------------------------------------------------------- RE-03b paginación
describe('paginate', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('tamaño de página canónico = 10', () => {
    expect(PAGE_SIZE).toBe(10);
    expect(paginate(items(10), 0).slice).toHaveLength(10);
    expect(paginate(items(10), 0).pageCount).toBe(1);
  });

  it('11 ítems → 2 páginas; la última incompleta (1 fila)', () => {
    const p0 = paginate(items(11), 0);
    expect(p0.pageCount).toBe(2);
    expect(p0.slice).toHaveLength(10);
    expect(p0.hasNext).toBe(true);
    const p1 = paginate(items(11), 1);
    expect(p1.slice).toEqual([10]);
    expect(p1.hasNext).toBe(false);
    expect(p1.hasPrev).toBe(true);
    expect([p1.from, p1.to]).toEqual([11, 11]);
  });

  it('casos: 0, 1, 20, 21 ítems', () => {
    expect(paginate(items(0), 0)).toMatchObject({ pageCount: 1, slice: [], hasPrev: false, hasNext: false, from: 0, to: 0 });
    expect(paginate(items(1), 0).slice).toEqual([0]);
    expect(paginate(items(20), 1)).toMatchObject({ pageCount: 2, slice: Array.from({ length: 10 }, (_, i) => i + 10), hasNext: false });
    expect(paginate(items(21), 2)).toMatchObject({ pageCount: 3, slice: [20] });
  });

  it('12 ítems sembrados (caso E2E) → 10 + 2', () => {
    expect(paginate(items(12), 0).slice).toHaveLength(10);
    expect(paginate(items(12), 1).slice).toHaveLength(2);
  });

  it('recorte de índice fuera de rango y pageSize alternativo', () => {
    expect(paginate(items(12), 99).page).toBe(1);
    expect(paginate(items(12), -3).page).toBe(0);
    expect(paginate(items(7), 1, 5).slice).toEqual([5, 6]);
    expect(paginate(items(7), 0, 0).slice).toHaveLength(7); // pageSize inválido → cae a 10
  });
});
