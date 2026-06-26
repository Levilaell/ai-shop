import { describe, it, expect } from 'vitest';
import {
  evaluateComplianceGate,
  buildCaption,
  AI_LABEL_REMINDER,
  type ComplianceChecklist,
} from './compliance.js';

const complete: ComplianceChecklist = {
  ai_label_required: true,
  claims_ok: true,
  reviewed_by: '11111111-1111-1111-1111-111111111111',
  reviewed_at: '2026-06-25T12:00:00Z',
};

describe('evaluateComplianceGate', () => {
  it('passes when claims are OK and the review is recorded', () => {
    expect(evaluateComplianceGate(complete)).toEqual({ ok: true, reasons: [] });
  });

  it('blocks when the checklist row is missing', () => {
    const r = evaluateComplianceGate(null);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(/ainda não criado/);
  });

  it('blocks when claims_ok is not true', () => {
    expect(evaluateComplianceGate({ ...complete, claims_ok: null }).ok).toBe(false);
    expect(evaluateComplianceGate({ ...complete, claims_ok: false }).ok).toBe(false);
    expect(evaluateComplianceGate({ ...complete, claims_ok: null }).reasons.join()).toMatch(/claims_ok/);
  });

  it('blocks when the review is not recorded', () => {
    expect(evaluateComplianceGate({ ...complete, reviewed_by: null }).ok).toBe(false);
    expect(evaluateComplianceGate({ ...complete, reviewed_at: null }).ok).toBe(false);
  });

  it('accumulates multiple reasons', () => {
    const r = evaluateComplianceGate({
      ai_label_required: true,
      claims_ok: false,
      reviewed_by: null,
      reviewed_at: null,
    });
    expect(r.reasons).toHaveLength(2);
  });
});

describe('buildCaption', () => {
  it('joins hook, body, cta with blank lines, hook first', () => {
    expect(buildCaption({ hook: 'Olha isso', body: 'Demonstra', cta: 'Link na bio' })).toBe(
      'Olha isso\n\nDemonstra\n\nLink na bio',
    );
  });
  it('drops empty parts', () => {
    expect(buildCaption({ hook: 'Hook', body: '   ', cta: 'CTA' })).toBe('Hook\n\nCTA');
  });
});

describe('AI_LABEL_REMINDER', () => {
  it('mentions the TikTok AIGC label', () => {
    expect(AI_LABEL_REMINDER).toMatch(/AIGC|rótulo de conteúdo de IA/i);
  });
});
