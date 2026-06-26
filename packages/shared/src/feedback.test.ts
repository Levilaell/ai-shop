import { describe, it, expect } from 'vitest';
import {
  realizedEconomics,
  blendScore,
  DEFAULT_FEEDBACK_CONFIG,
  type RealizedPerf,
} from './feedback.js';

const base: RealizedPerf = {
  views: 0,
  clicks: 0,
  orders: 0,
  commissionBrl: 0,
  productionCostBrl: 11,
};

describe('realizedEconomics', () => {
  it('computes profit and roi', () => {
    const e = realizedEconomics({ ...base, orders: 3, commissionBrl: 44 });
    expect(e.profitBrl).toBe(33);
    expect(e.roi).toBeCloseTo(3, 6);
    expect(e.converted).toBe(true);
  });
  it('roi is 0 when cost is 0', () => {
    expect(realizedEconomics({ ...base, productionCostBrl: 0 }).roi).toBe(0);
  });
});

describe('blendScore', () => {
  it('keeps the predicted score when there is no signal (low views, no orders)', () => {
    expect(blendScore(70, { ...base, views: 100, orders: 0 })).toBe(70);
  });

  it('penalizes a flop (reach but zero orders)', () => {
    // realized = 0, weight 0.5 => 70 * 0.5 = 35
    expect(blendScore(70, { ...base, views: 5000, orders: 0 })).toBe(35);
  });

  it('boosts a strong converter above its prediction', () => {
    // orders>0, roi=3 => realized 100; blend 60*0.5 + 100*0.5 = 80
    const out = blendScore(60, { ...base, orders: 5, commissionBrl: 44 });
    expect(out).toBe(80);
  });

  it('break-even converter pulls toward 50', () => {
    // roi=0 => realized 50; blend 80*0.5 + 50*0.5 = 65
    const out = blendScore(80, { ...base, orders: 1, commissionBrl: 11 });
    expect(out).toBe(65);
  });

  it('a money-losing converter is demoted below break-even', () => {
    // commission 5.5 < cost 11 => roi -0.5 => realized 50 + (-0.5/3)*50 ≈ 41.67
    const out = blendScore(80, { ...base, orders: 1, commissionBrl: 5.5 });
    expect(out).toBeLessThan(blendScore(80, { ...base, orders: 1, commissionBrl: 11 }));
  });

  it('stays within 0..100', () => {
    expect(blendScore(100, { ...base, views: 99999, orders: 0 })).toBeGreaterThanOrEqual(0);
    expect(blendScore(0, { ...base, orders: 99, commissionBrl: 9999 })).toBeLessThanOrEqual(100);
  });

  it('respects a custom weight (1 = fully realized)', () => {
    const cfg = { ...DEFAULT_FEEDBACK_CONFIG, weight: 1 };
    expect(blendScore(70, { ...base, views: 5000, orders: 0 }, cfg)).toBe(0);
  });
});
