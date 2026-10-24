import { describe, expect, it } from 'vitest';
import {
  MIN_OPENING_SECONDS,
  buildSiweMessage,
  childBandwidth,
  formatDuration,
  formatToken,
  minOpeningBalanceWei,
  parseToken,
  portalChecklist,
  remainingSeconds,
  validateStream,
} from '../src/lib/portal-logic';

const TARIFF = 500_000_000_000_000n; // 0.0005
const PAYOUT = '0x' + '22'.repeat(20);

describe('garantía de apertura 1 h (D54)', () => {
  it('rate × 3600', () => {
    expect(MIN_OPENING_SECONDS).toBe(3600);
    expect(minOpeningBalanceWei(TARIFF)).toBe(TARIFF * 3600n);
  });
});

describe('validación de stream (RF-05/D54)', () => {
  const base = { rateWei: TARIFF, tariffWei: TARIFF, balanceWei: TARIFF * 3600n, receiver: PAYOUT, payoutWallet: PAYOUT };
  it('acepta el mínimo exacto de 1 h', () => {
    expect(validateStream(base)).toEqual({ ok: true, reason: 'ok' });
  });
  it('rechaza 1 wei por debajo de la garantía', () => {
    expect(validateStream({ ...base, balanceWei: TARIFF * 3600n - 1n }).reason).toBe('insufficient_balance');
  });
  it('rechaza tasa por debajo de la tarifa', () => {
    expect(validateStream({ ...base, rateWei: TARIFF - 1n }).reason).toBe('rate_below_tariff');
  });
  it('rechaza rate 0', () => {
    expect(validateStream({ ...base, rateWei: 0n }).reason).toBe('invalid_rate');
  });
  it('rechaza receptor distinto del payout', () => {
    expect(validateStream({ ...base, receiver: '0x' + '33'.repeat(20) }).reason).toBe('invalid_receiver');
  });
});

describe('formato de tokens y tiempo', () => {
  it('formatea 18 decimales', () => {
    expect(formatToken(1_800_000_000_000_000_000n)).toBe('1.8');
    expect(formatToken(0n)).toBe('0.0');
    expect(formatToken(1_234_567_890_000_000_000n, 18, 4)).toBe('1.2345');
  });
  it('parsea sin coma flotante', () => {
    expect(parseToken('1.8')).toBe(1_800_000_000_000_000_000n);
    expect(parseToken('0.0005')).toBe(500_000_000_000_000n);
    expect(parseToken('')).toBe(0n);
    expect(parseToken('abc')).toBe(0n);
    expect(parseToken('1,5')).toBe(1_500_000_000_000_000_000n);
  });
  it('formatea duración', () => {
    expect(formatDuration(65)).toBe('01 min 05 s');
    expect(formatDuration(3661)).toBe('1 h 01 min 01 s');
    expect(formatDuration(-1)).toBe('0 s');
  });
  it('calcula segundos restantes', () => {
    const now = Date.parse('2026-10-17T12:00:00Z');
    expect(remainingSeconds('2026-10-17T12:01:00Z', now)).toBe(60);
    expect(remainingSeconds('2026-10-17T11:59:00Z', now)).toBe(0);
    expect(remainingSeconds(null, now)).toBeNull();
  });
});

describe('QoS de hijos (RF-26)', () => {
  it('hijo al 50 % del plan 50/10 Mbps', () => {
    expect(childBandwidth(50_000_000, 10_000_000, 50)).toEqual({ downBps: 25_000_000, upBps: 5_000_000 });
  });
  it('rechaza porcentaje inválido', () => {
    expect(() => childBandwidth(1, 1, 0)).toThrow();
  });
});

describe('flujo del portal', () => {
  it('el mensaje SIWE liga la sesión', () => {
    const msg = buildSiweMessage({
      domain: 'sfhostpot.local',
      sessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      wallet: '0x' + '11'.repeat(20),
      issuedAt: '2026-10-17T12:00:00Z',
    });
    expect(msg).toContain('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(msg).toContain('0x' + '11'.repeat(20));
  });

  it('los pasos son progresivos y deterministas', () => {
    const base = {
      hasBindToken: true,
      noticeAccepted: true,
      sessionId: 's',
      walletConnected: true,
      bindingId: null as string | null,
      wrappedBalanceWei: 0n,
    };
    expect(portalChecklist(base)).toEqual({ canSign: true, canWrap: false, canStream: false });
    expect(portalChecklist({ ...base, bindingId: 'b' }).canWrap).toBe(true);
    expect(portalChecklist({ ...base, bindingId: 'b', wrappedBalanceWei: 1n }).canStream).toBe(true);
    expect(portalChecklist({ ...base, noticeAccepted: false }).canSign).toBe(false);
  });
});
