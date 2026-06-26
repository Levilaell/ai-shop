import { describe, it, expect } from 'vitest';
import { heygenCostUsd, HEYGEN_USD_PER_MINUTE } from './video-provider.js';

describe('heygenCostUsd', () => {
  it('charges Avatar III at ~US$1/min', () => {
    expect(heygenCostUsd(60, 'iii')).toBe(1);
    expect(heygenCostUsd(30, 'iii')).toBe(0.5);
    expect(heygenCostUsd(0, 'iii')).toBe(0);
  });
  it('charges Avatar IV at ~US$4/min', () => {
    expect(heygenCostUsd(60, 'iv')).toBe(4);
    expect(heygenCostUsd(30, 'iv')).toBe(2);
  });
  it('rounds to 4 decimals (numeric(10,4) column)', () => {
    // 17s at $1/min = 0.283333... -> 0.2833
    expect(heygenCostUsd(17, 'iii')).toBe(0.2833);
  });
  it('IV is 4x III for the same duration', () => {
    expect(heygenCostUsd(45, 'iv')).toBeCloseTo(heygenCostUsd(45, 'iii') * 4, 6);
  });
  it('exposes the per-minute rate table', () => {
    expect(HEYGEN_USD_PER_MINUTE).toEqual({ iii: 1, iv: 4 });
  });
});
