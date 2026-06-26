/**
 * Score feedback loop (spec §12 T8). Once a publication has real performance,
 * blend the *predicted* selection score with the *realized* outcome so the board
 * and future ranking reflect reality — a product that actually converted should
 * outrank one that only looked good on paper, and a flop (lots of views, zero
 * orders) should be demoted. Pure + tested.
 */

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);

export interface RealizedPerf {
  readonly views: number;
  readonly clicks: number;
  readonly orders: number;
  readonly commissionBrl: number;
  readonly productionCostBrl: number;
}

export interface RealizedEconomics {
  readonly profitBrl: number;
  /** profit / cost (0 if cost is 0). */
  readonly roi: number;
  readonly converted: boolean;
}

export function realizedEconomics(p: RealizedPerf): RealizedEconomics {
  const profitBrl = p.commissionBrl - p.productionCostBrl;
  const roi = p.productionCostBrl > 0 ? profitBrl / p.productionCostBrl : 0;
  return { profitBrl, roi, converted: p.orders > 0 };
}

export interface FeedbackConfig {
  /** How much realized outcome pulls the predicted score (0..1). */
  readonly weight: number;
  /** Views at/above which "zero orders" counts as a flop (got reach, no sales). */
  readonly flopViewsThreshold: number;
  /** ROI that maps a converting product to a perfect realized score. */
  readonly roiForFullMarks: number;
}

export const DEFAULT_FEEDBACK_CONFIG: FeedbackConfig = {
  weight: 0.5,
  flopViewsThreshold: 1000,
  roiForFullMarks: 3,
};

/**
 * Blend a product's predicted score (0..100) with its realized performance.
 *  - Converted (orders > 0): realized score scales with ROI (negative ROI < 50,
 *    break-even = 50, ROI ≥ roiForFullMarks = 100).
 *  - Flop (views ≥ threshold, 0 orders): realized score = 0.
 *  - Not enough data yet: keep the predicted score (no signal).
 */
export function blendScore(
  predicted: number,
  p: RealizedPerf,
  config: FeedbackConfig = DEFAULT_FEEDBACK_CONFIG,
): number {
  let realized: number;
  if (p.orders > 0) {
    const { roi } = realizedEconomics(p);
    realized = clamp(50 + (roi / config.roiForFullMarks) * 50, 0, 100);
  } else if (p.views >= config.flopViewsThreshold) {
    realized = 0;
  } else {
    realized = predicted; // insufficient data — don't move the score
  }
  const blended = predicted * (1 - config.weight) + realized * config.weight;
  return Math.round(clamp(blended, 0, 100) * 100) / 100;
}
