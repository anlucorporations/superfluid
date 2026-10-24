import { describe, expect, it } from 'vitest';
import {
  evaluateChildSolvency,
  evaluateSolvency,
  openingCollateralWei,
} from '../src/domain/solvency.js';
import { childBandwidth, validateFlowTarget } from '../src/domain/tariff.js';
import {
  canRedeem,
  childrenUsedAfterConnect,
  childrenUsedAfterRelease,
  generateVoucherCode,
  hashVoucherCode,
} from '../src/domain/voucher.js';
import {
  provisionalOracle,
  provisionalUntil,
  shouldExpireProvisional,
  validateProvisionalObservation,
} from '../src/domain/provisional.js';

const TARIFF = {
  id: 't1',
  gatewayId: 'g1',
  tokenAddress: '0x1111111111111111111111111111111111111111',
  payoutWallet: '0x2222222222222222222222222222222222222222',
  pricePerSecondWei: 500_000_000_000_000n,
  bandwidthDownBps: 50_000_000,
  bandwidthUpBps: 10_000_000,
  maxChildrenPerParent: 5,
};

describe('solvencia (H-01/D43)', () => {
  const base = { status: 'active', flowRateWei: 500n, tariffWei: 500n, virtualBalanceWei: 1n };

  it('solvente con estado active, tasa suficiente y balance > 0', () => {
    expect(evaluateSolvency(base)).toEqual({ solvent: true, reason: 'ok' });
  });
  it('no solvente si el flow está pausado', () => {
    expect(evaluateSolvency({ ...base, status: 'paused' }).reason).toBe('flow_not_active');
  });
  it('no solvente si la tasa no cubre la tarifa', () => {
    expect(evaluateSolvency({ ...base, flowRateWei: 499n }).reason).toBe('rate_below_tariff');
  });
  it('no solvente si el balance virtual es 0', () => {
    expect(evaluateSolvency({ ...base, virtualBalanceWei: 0n }).reason).toBe('insufficient_balance');
  });
  it('el hijo hereda la solvencia del padre', () => {
    expect(evaluateChildSolvency(base).solvent).toBe(true);
    expect(evaluateChildSolvency({ ...base, virtualBalanceWei: -1n }).solvent).toBe(false);
  });
  it('D54: garantía de apertura = rate × 3600 (1 h)', () => {
    expect(openingCollateralWei(500n)).toBe(1_800_000n);
  });
});

describe('tarifa y QoS (RF-09/RF-26)', () => {
  const ok = {
    receiver: TARIFF.payoutWallet,
    tokenAddress: TARIFF.tokenAddress,
    requestedRateWei: TARIFF.pricePerSecondWei,
    tariff: TARIFF,
    expectedToken: TARIFF.tokenAddress,
  };
  it('acepta receptor/token/payout/tarifa correctos', () => {
    expect(validateFlowTarget(ok).ok).toBe(true);
  });
  it('rechaza payout distinto', () => {
    expect(validateFlowTarget({ ...ok, receiver: '0x3333333333333333333333333333333333333333' }).reason).toBe('payout_mismatch');
  });
  it('rechaza token distinto', () => {
    expect(validateFlowTarget({ ...ok, tokenAddress: '0x4444444444444444444444444444444444444444' }).reason).toBe('token_mismatch');
  });
  it('rechaza tasa inferior a la tarifa', () => {
    expect(validateFlowTarget({ ...ok, requestedRateWei: 1n }).reason).toBe('rate_below_tariff');
  });
  it('hijo al 50 % del plan 50/10 Mbps = 25/5 Mbps', () => {
    expect(childBandwidth(TARIFF, 50)).toEqual({ downBps: 25_000_000, upBps: 5_000_000 });
  });
  it('rechaza bandwidth_percent fuera de rango', () => {
    expect(() => childBandwidth(TARIFF, 0)).toThrow();
  });
});

describe('vouchers (RF-25/D55)', () => {
  const now = new Date('2026-10-17T12:00:00Z');
  const voucher = {
    status: 'active',
    validFrom: new Date('2026-10-01T00:00:00Z'),
    validTo: new Date('2027-01-01T00:00:00Z'),
    maxChildren: 2,
    childrenUsed: 0,
    parentAlive: true,
  };
  it('permite canje válido', () => {
    expect(canRedeem({ voucher, now })).toEqual({ ok: true, reason: 'ok' });
  });
  it('rechaza si el padre no está vivo', () => {
    expect(canRedeem({ voucher: { ...voucher, parentAlive: false }, now }).reason).toBe('parent_not_alive');
  });
  it('rechaza sin cupo', () => {
    expect(canRedeem({ voucher: { ...voucher, childrenUsed: 2 }, now }).reason).toBe('no_quota');
  });
  it('rechaza caducado', () => {
    expect(canRedeem({ voucher, now: new Date('2028-01-01T00:00:00Z') }).reason).toBe('expired');
  });
  it('rechaza el mismo dispositivo con redención viva', () => {
    expect(canRedeem({ voucher, now, sameDeviceLive: true }).reason).toBe('device_already_live');
  });
  it('el cupo se libera al desconectar (vivo, no de por vida)', () => {
    expect(childrenUsedAfterConnect(voucher)).toBe(1);
    expect(childrenUsedAfterRelease({ ...voucher, childrenUsed: 1 })).toBe(0);
  });
  it('el código es de 12 chars Crockford y se guarda hasheado', () => {
    const code = generateVoucherCode();
    expect(code).toHaveLength(12);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(hashVoucherCode(code)).toHaveLength(64);
    expect(hashVoucherCode(code)).toBe(hashVoucherCode(code.toLowerCase()));
  });
});

describe('provisional (RF-12/D56)', () => {
  const obs = {
    from: TARIFF.payoutWallet,
    to: TARIFF.tokenAddress,
    method: 'createFlow',
    receiver: TARIFF.payoutWallet,
    flowRateWei: TARIFF.pricePerSecondWei,
    executable: true,
  };
  const exp = {
    wallet: TARIFF.payoutWallet,
    superToken: TARIFF.tokenAddress,
    payoutWallet: TARIFF.payoutWallet,
    tariffWei: TARIFF.pricePerSecondWei,
  };
  it('acepta una observación correcta', () => {
    expect(validateProvisionalObservation(obs, exp)).toEqual({ ok: true, reason: 'ok' });
  });
  it('rechaza emisor distinto', () => {
    expect(validateProvisionalObservation({ ...obs, from: '0x9999999999999999999999999999999999999999' }, exp).reason).toBe('wrong_sender');
  });
  it('rechaza tasa insuficiente', () => {
    expect(validateProvisionalObservation({ ...obs, flowRateWei: 1n }, exp).reason).toBe('rate_below_tariff');
  });
  it('oráculo único por modo (visible vs receipt)', () => {
    expect(provisionalOracle('visible')).toBe('eth_getTransactionByHash');
    expect(provisionalOracle('receipt')).toBe('eth_getTransactionReceipt');
  });
  it('vence a los 60 s sin confirmación', () => {
    const until = provisionalUntil(0, 60);
    expect(shouldExpireProvisional(until.getTime(), 59_000, false)).toBe(false);
    expect(shouldExpireProvisional(until.getTime(), 60_000, false)).toBe(true);
    expect(shouldExpireProvisional(until.getTime(), 60_000, true)).toBe(false);
  });
});
